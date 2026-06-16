import { existsSync } from 'node:fs';
import { access, chmod, copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFeatureList } from '../validate-feature-list.mjs';

export const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TEMPLATE_DIR = path.join(SKILL_ROOT, 'templates');
export const SUBSYSTEMS = ['instructions', 'state', 'verification', 'scope', 'lifecycle'];

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[key] = argv[i + 1];
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

export async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readText(filePath) {
  return readFile(filePath, 'utf8');
}

export async function readJson(filePath) {
  return JSON.parse(await readText(filePath));
}

export async function writeText(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
}

export async function copyTemplate(templateName, targetPath, replacements = {}, { force = false } = {}) {
  if (!force && await exists(targetPath)) {
    return { path: targetPath, status: 'skipped', reason: 'exists' };
  }

  let contents = await readText(path.join(TEMPLATE_DIR, templateName));
  for (const [key, value] of Object.entries(replacements)) {
    contents = contents.split(`{{${key}}}`).join(value);
  }
  await writeText(targetPath, contents);
  if (templateName.endsWith('.sh')) {
    await chmod(targetPath, 0o755);
  }
  return { path: targetPath, status: 'written' };
}

export function detectPackageManager(root, explicit) {
  if (explicit) return explicit;
  if (existsSync(path.join(root, 'bun.lockb')) || existsSync(path.join(root, 'bun.lock'))) return 'bun';
  if (existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export async function detectProject(root) {
  const files = await listFiles(root, { maxFiles: 800 });
  const has = (name) => files.some((file) => file === name || file.endsWith(`/${name}`));
  const hasPrefix = (prefix) => files.some((file) => file.startsWith(prefix));
  const packageJsonPath = path.join(root, 'package.json');
  const packageJson = await exists(packageJsonPath).then((ok) => ok ? readJson(packageJsonPath) : null);

  let stack = 'generic';
  if (packageJson) {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (deps.react || hasPrefix('src/renderer')) stack = 'typescript-react';
    else if (deps.typescript || has('tsconfig.json')) stack = 'typescript';
    else stack = 'node';
  } else if (has('pyproject.toml') || has('requirements.txt')) {
    stack = 'python';
  } else if (has('go.mod')) {
    stack = 'go';
  } else if (has('Cargo.toml')) {
    stack = 'rust';
  } else if (has('pom.xml')) {
    stack = 'java-maven';
  } else if (has('build.gradle') || has('build.gradle.kts')) {
    stack = 'java-gradle';
  } else if (files.some((file) => file.endsWith('.csproj') || file.endsWith('.sln'))) {
    stack = 'dotnet';
  }

  return {
    root,
    stack,
    packageJson,
    files,
    packageManager: detectPackageManager(root)
  };
}

export async function listFiles(root, { maxFiles = 1000 } = {}) {
  const ignored = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.venv', 'venv', '__pycache__']);
  const results = [];

  async function walk(current, relative) {
    if (results.length >= maxFiles) return;
    let entries = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      if (ignored.has(entry.name)) continue;
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (entry.isFile()) {
        results.push(rel);
      }
    }
  }

  await walk(root, '');
  return results.sort();
}

export function verificationCommands(project, explicitPackageManager) {
  const pm = explicitPackageManager || project.packageManager || 'npm';
  const scripts = project.packageJson?.scripts ?? {};
  const run = (script) => {
    if (pm === 'npm') return `npm run ${script}`;
    if (pm === 'yarn') return `yarn ${script}`;
    return `${pm} run ${script}`;
  };

  if (project.stack === 'python') {
    return [
      'python -m pytest',
      'python -m compileall .'
    ];
  }

  if (project.stack === 'go') return ['go test ./...'];
  if (project.stack === 'rust') return ['cargo test'];
  if (project.stack === 'java-maven') return ['mvn test'];
  if (project.stack === 'java-gradle') return ['./gradlew test'];
  if (project.stack === 'dotnet') return ['dotnet test'];

  if (!project.packageJson) {
    return [
      'echo "No package manifest detected; replace this line with your project verification command."'
    ];
  }

  const install = pm === 'npm'
    ? 'npm install'
    : pm === 'yarn'
      ? 'yarn install'
      : `${pm} install`;
  const candidates = [
    scripts.check ? run('check') : null,
    scripts.typecheck ? run('typecheck') : null,
    scripts['type-check'] ? run('type-check') : null,
    scripts.lint ? run('lint') : null,
    scripts.test ? (pm === 'npm' ? 'npm test' : `${pm} test`) : null,
    scripts.build ? run('build') : null
  ].filter(Boolean);

  return [install, ...dedupe(candidates)];
}

export function initScriptFromCommands(commands) {
  const body = commands.map((command) => `echo "=== ${escapeForEcho(command)} ==="\n${command}`).join('\n\n');
  return `#!/bin/bash
set -e

echo "=== Harness Initialization ==="

${body}

echo "=== Verification Complete ==="
echo ""
echo "Next steps:"
echo "1. Read feature_list.json to see current feature state"
echo "2. Pick ONE unfinished feature to work on"
echo "3. Implement only that feature"
echo "4. Re-run verification before claiming done"
`;
}

function escapeForEcho(value) {
  return value.replaceAll('"', '\\"');
}

export function dedupe(values) {
  return [...new Set(values)];
}

export function scoreHarness(files) {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const allText = files.map((file) => `${file.path}\n${file.content}`).join('\n\n');
  const agents = byPath.get('AGENTS.md') || byPath.get('CLAUDE.md') || '';
  const featureList = byPath.get('feature_list.json') || byPath.get('feature-list.json') || '';
  const progress = byPath.get('progress.md') || byPath.get('claude-progress.md') || '';
  const init = byPath.get('init.sh') || '';
  const handoff = byPath.get('session-handoff.md') || '';
  const initFile = files.find((file) => file.path === 'init.sh');
  const initExecutable = Boolean(initFile && initFile.executable);
  const routesToDocs = files.some((file) => file.path.startsWith('docs/'));

  // Behavioural truth from the feature list, not just the presence of keywords.
  // A done feature without recorded evidence, or a second in-progress feature,
  // sinks the score even when AGENTS.md name-drops the right phrases.
  let fl = { parsed: false, flags: { structural: false, enum: false, evidenceGate: false, wip: false, dependencies: false, hasVerifiedDone: false }, errors: [] };
  if (featureList) {
    try {
      const result = checkFeatureList(JSON.parse(featureList));
      fl = { parsed: true, flags: result.flags, errors: result.errors };
    } catch (error) {
      fl = { parsed: false, flags: fl.flags, errors: [`feature_list.json is not valid JSON (${error.message}).`] };
    }
  }
  const f = fl.flags;

  const checks = {
    instructions: [
      hasFile(byPath, ['AGENTS.md', 'CLAUDE.md'], 'Agent instruction file exists'),
      textHas(agents, ['Startup Workflow', 'Before writing code'], 'Startup workflow documented'),
      textHas(agents, ['Definition of Done', 'done only when'], 'Definition of done documented'),
      textHas(agents, ['Verification Commands', './init.sh', 'test', 'verify'], 'Verification commands discoverable'),
      { pass: routesToDocs || textHas(agents, ['feature_list.json', 'progress.md'], '').pass, message: 'State/docs routed from instructions (feature_list.json, progress.md, or docs/)' }
    ],
    state: [
      hasFile(byPath, ['feature_list.json', 'feature-list.json'], 'Feature tracker exists'),
      { pass: fl.parsed && f.structural && f.enum, message: 'Feature tracker is valid JSON with canonical fields and status enum' },
      hasFile(byPath, ['progress.md', 'claude-progress.md'], 'Progress log exists'),
      textHas(progress, ['Current State', 'What', 'Next'], 'Progress log supports restart'),
      textHas(handoff || progress, ['Blockers', 'Files', 'Next Session'], 'Handoff captures blockers/files/next step')
    ],
    verification: [
      hasFile(byPath, ['init.sh'], 'Verification entrypoint exists'),
      { pass: initFailsFast(init) && initExecutable, message: 'init.sh fails fast (set -e on a real line) and is executable' },
      textHas(init + agents, ['test', 'pytest', 'vitest', 'cargo test', 'go test', 'dotnet test'], 'Test command documented'),
      textHas(init + agents, ['build', 'type', 'lint', 'compile'], 'Static/build check documented'),
      { pass: f.hasVerifiedDone || textHas(handoff, ['Verification Evidence']).pass, message: 'Verification evidence recorded (a done feature carries evidence, or handoff has an evidence table)' }
    ],
    scope: [
      textHas(agents, ['One feature at a time', 'one-feature-at-a-time', 'one feature'], 'One-feature-at-a-time rule documented'),
      { pass: fl.parsed && f.wip, message: 'At most one feature is in_progress (WIP cap holds)' },
      { pass: fl.parsed && f.evidenceGate, message: 'No feature is marked done without evidence + verification' },
      { pass: fl.parsed && f.dependencies, message: 'Feature dependencies resolve to real ids' },
      textHas(agents, ['Stay in scope', 'scope'], 'Scope boundary documented')
    ],
    lifecycle: [
      hasFile(byPath, ['init.sh'], 'Startup script exists'),
      textHas(agents, ['End of Session', 'Before ending'], 'End-of-session procedure exists'),
      hasFile(byPath, ['session-handoff.md'], 'Session handoff template exists'),
      textHas(progress + handoff, ['Last Updated', 'Current Objective', 'Recommended Next Step'], 'Session restart markers exist'),
      textHas(agents + init, ['restartable', 'clean', 'Next steps'], 'Clean restart path documented')
    ]
  };

  const subsystems = Object.fromEntries(Object.entries(checks).map(([name, subsystemChecks]) => {
    const passed = subsystemChecks.filter((check) => check.pass).length;
    const score = Math.max(1, Math.round((passed / subsystemChecks.length) * 5));
    return [name, {
      score,
      passed,
      total: subsystemChecks.length,
      checks: subsystemChecks
    }];
  }));

  const total = Object.values(subsystems).reduce((sum, item) => sum + item.score, 0);
  const overall = Math.round((total / (SUBSYSTEMS.length * 5)) * 100);
  const bottleneck = Object.entries(subsystems).sort((a, b) => a[1].score - b[1].score)[0][0];

  // Hard gate: the keyword score is advisory, but feature-list invariants are
  // not negotiable. A present-but-invalid feature list (done without evidence,
  // WIP breach, bad enum, dangling deps) fails the harness regardless of score.
  const gate = { passed: true, violations: [] };
  if (fl.parsed && !(f.structural && f.enum && f.evidenceGate && f.wip && f.dependencies)) {
    gate.passed = false;
    gate.violations = fl.errors;
  } else if (featureList && !fl.parsed) {
    gate.passed = false;
    gate.violations = fl.errors.length ? fl.errors : ['feature_list.json is present but could not be parsed.'];
  }

  return { overall, bottleneck, subsystems, gate };
}

function hasFile(byPath, names, message) {
  return { pass: names.some((name) => byPath.has(name)), message };
}

function textHas(text, needles, message) {
  const lower = text.toLowerCase();
  return { pass: needles.some((needle) => lower.includes(needle.toLowerCase())), message };
}

// A comment that merely mentions "set -euo pipefail" must NOT count. Only a real,
// non-comment `set -e[...]` line means the script actually aborts on failure.
function initFailsFast(content) {
  return content.split('\n').some((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return false;
    return /^set\s+-[a-z]*e/i.test(trimmed);
  });
}

export async function loadHarnessFiles(root) {
  const candidates = [
    'AGENTS.md',
    'CLAUDE.md',
    'feature_list.json',
    'feature-list.json',
    'progress.md',
    'claude-progress.md',
    'session-handoff.md',
    'clean-state-checklist.md',
    'init.sh'
  ];
  // A handful of conventional docs so progressive-disclosure routing is visible
  // to the scorer (instructions that point into docs/ rather than inlining facts).
  const docCandidates = [
    'docs/ARCHITECTURE.md', 'docs/PRODUCT.md', 'docs/RELIABILITY.md',
    'docs/DESIGN.md', 'docs/SECURITY.md', 'ARCHITECTURE.md'
  ];
  const files = [];
  for (const candidate of [...candidates, ...docCandidates]) {
    const fullPath = path.join(root, candidate);
    if (await exists(fullPath)) {
      let executable = false;
      try {
        executable = ((await stat(fullPath)).mode & 0o111) !== 0;
      } catch {
        executable = false;
      }
      files.push({ path: candidate, content: await readText(fullPath), executable });
    }
  }
  return files;
}

export function formatScoreReport(result, root = '.') {
  const lines = [
    `Harness validation for ${root}`,
    `Overall: ${result.overall}/100`,
    `Bottleneck: ${result.bottleneck}`,
    `Invariant gate: ${result.gate?.passed === false ? 'FAIL' : 'PASS'}`,
    ''
  ];
  if (result.gate && result.gate.passed === false) {
    lines.push('Hard invariant violations (these fail the harness regardless of score):');
    for (const violation of result.gate.violations) lines.push(`  GATE ${violation}`);
    lines.push('');
  }

  for (const [name, subsystem] of Object.entries(result.subsystems)) {
    lines.push(`${name}: ${subsystem.score}/5 (${subsystem.passed}/${subsystem.total})`);
    for (const check of subsystem.checks) {
      lines.push(`  ${check.pass ? 'PASS' : 'FAIL'} ${check.message}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function htmlReport(result, title = 'Harness Assessment') {
  const rows = Object.entries(result.subsystems).map(([name, subsystem]) => {
    const checks = subsystem.checks.map((check) =>
      `<li class="${check.pass ? 'pass' : 'fail'}">${check.pass ? 'PASS' : 'FAIL'} ${escapeHtml(check.message)}</li>`
    ).join('');
    return `<section>
      <h2>${escapeHtml(name)} <span>${subsystem.score}/5</span></h2>
      <ul>${checks}</ul>
    </section>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #172026; background: #f7f8fa; }
    main { max-width: 960px; margin: 0 auto; }
    header { margin-bottom: 24px; }
    h1 { margin: 0 0 8px; font-size: 32px; }
    .summary { display: flex; gap: 16px; flex-wrap: wrap; margin: 20px 0; }
    .metric { background: white; border: 1px solid #d9dee5; border-radius: 8px; padding: 16px 18px; min-width: 180px; }
    .metric strong { display: block; font-size: 28px; margin-top: 4px; }
    section { background: white; border: 1px solid #d9dee5; border-radius: 8px; margin: 14px 0; padding: 16px 18px; }
    h2 { margin: 0 0 10px; font-size: 20px; display: flex; justify-content: space-between; }
    ul { margin: 0; padding-left: 20px; }
    li { margin: 6px 0; }
    .pass { color: #126c43; }
    .fail { color: #a23020; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <p>Five-subsystem harness validation report.</p>
      <div class="summary">
        <div class="metric">Overall<strong>${result.overall}/100</strong></div>
        <div class="metric">Bottleneck<strong>${escapeHtml(result.bottleneck)}</strong></div>
      </div>
    </header>
    ${rows}
  </main>
</body>
</html>
`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function copyFileSafe(source, target, { force = false } = {}) {
  if (!force && await exists(target)) {
    return { path: target, status: 'skipped', reason: 'exists' };
  }
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  return { path: target, status: 'written' };
}
