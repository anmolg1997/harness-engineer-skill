// Shared utilities for the harness-engineer scripts. Pure Node built-ins so the
// whole skill stays dependency-free and copyable into any repo.
import { existsSync } from 'node:fs';
import { access, chmod, copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFeatureList } from '../validate-feature-list.mjs';

export const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TEMPLATE_DIR = path.join(SKILL_ROOT, 'templates');
export const SUBSYSTEMS = ['instructions', 'state', 'verification', 'scope', 'lifecycle'];

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.venv', 'venv', '__pycache__']);

// --- argument parsing -------------------------------------------------------
// Accepts `--key value`, `--key=value`, and bare boolean `--key`. Hyphenated
// keys are camelCased so `--agent-file` reads as args.agentFile.
export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) { args._.push(token); continue; }
    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (inlineValue !== undefined) { args[key] = inlineValue; continue; }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { args[key] = next; i += 1; }
    else args[key] = true;
  }
  return args;
}

// --- tiny fs helpers --------------------------------------------------------
export async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}
export const readText = (filePath) => readFile(filePath, 'utf8');
export const readJson = async (filePath) => JSON.parse(await readText(filePath));
export async function writeText(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
}
export function dedupe(values) { return [...new Set(values)]; }

export async function copyFileSafe(source, target, { force = false } = {}) {
  if (!force && await exists(target)) return { path: target, status: 'skipped', reason: 'exists' };
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  return { path: target, status: 'written' };
}

// Render a bundled template into the target, substituting {{TOKEN}} placeholders.
// Existing files are left untouched unless force is set. Shell templates get +x.
export async function copyTemplate(templateName, targetPath, replacements = {}, { force = false } = {}) {
  if (!force && await exists(targetPath)) return { path: targetPath, status: 'skipped', reason: 'exists' };
  let body = await readText(path.join(TEMPLATE_DIR, templateName));
  for (const [token, value] of Object.entries(replacements)) {
    body = body.split(`{{${token}}}`).join(value);
  }
  await writeText(targetPath, body);
  if (templateName.endsWith('.sh')) await chmod(targetPath, 0o755);
  return { path: targetPath, status: 'written' };
}

// --- project detection ------------------------------------------------------
export function detectPackageManager(root, explicit) {
  if (explicit) return explicit;
  const here = (f) => existsSync(path.join(root, f));
  if (here('bun.lockb') || here('bun.lock')) return 'bun';
  if (here('pnpm-lock.yaml')) return 'pnpm';
  if (here('yarn.lock')) return 'yarn';
  return 'npm';
}

// Walk the tree (skipping heavy dirs) and return relative file paths, capped.
export async function listFiles(root, { maxFiles = 1000 } = {}) {
  const out = [];
  const walk = async (dir, rel) => {
    if (out.length >= maxFiles) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (out.length >= maxFiles) return;
      if (IGNORED_DIRS.has(entry.name)) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const childAbs = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(childAbs, childRel);
      else if (entry.isFile()) out.push(childRel);
    }
  };
  await walk(root, '');
  return out.sort();
}

// Infer the stack so verification commands and the AGENTS.md blurb can be tailored.
export async function detectProject(root) {
  const files = await listFiles(root, { maxFiles: 800 });
  const has = (name) => files.some((f) => f === name || f.endsWith(`/${name}`));
  const underPrefix = (prefix) => files.some((f) => f.startsWith(prefix));
  const pkgPath = path.join(root, 'package.json');
  const packageJson = (await exists(pkgPath)) ? await readJson(pkgPath) : null;

  let stack = 'generic';
  if (packageJson) {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (deps.react || underPrefix('src/renderer')) stack = 'typescript-react';
    else if (deps.typescript || has('tsconfig.json')) stack = 'typescript';
    else stack = 'node';
  } else if (has('pyproject.toml') || has('requirements.txt')) stack = 'python';
  else if (has('go.mod')) stack = 'go';
  else if (has('Cargo.toml')) stack = 'rust';
  else if (has('pom.xml')) stack = 'java-maven';
  else if (has('build.gradle') || has('build.gradle.kts')) stack = 'java-gradle';
  else if (files.some((f) => f.endsWith('.csproj') || f.endsWith('.sln'))) stack = 'dotnet';

  return { root, stack, packageJson, files, packageManager: detectPackageManager(root) };
}

// Pick a reasonable verify command set for the detected stack. For Node we probe
// package.json scripts so we only emit commands that actually exist.
const NON_NODE_COMMANDS = {
  python: ['python -m pytest', 'python -m compileall .'],
  go: ['go test ./...'],
  rust: ['cargo test'],
  'java-maven': ['mvn test'],
  'java-gradle': ['./gradlew test'],
  dotnet: ['dotnet test'],
};

export function verificationCommands(project, explicitPackageManager) {
  if (NON_NODE_COMMANDS[project.stack]) return NON_NODE_COMMANDS[project.stack];
  if (!project.packageJson) {
    return ['echo "No package manifest detected; replace this line with your project verification command."'];
  }

  const pm = explicitPackageManager || project.packageManager || 'npm';
  const scripts = project.packageJson.scripts ?? {};
  const runScript = (name) => (pm === 'npm' ? `npm run ${name}` : pm === 'yarn' ? `yarn ${name}` : `${pm} run ${name}`);
  const testCmd = pm === 'npm' ? 'npm test' : `${pm} test`;
  const install = pm === 'yarn' ? 'yarn install' : `${pm} install`;

  const candidates = [];
  if (scripts.check) candidates.push(runScript('check'));
  if (scripts.typecheck) candidates.push(runScript('typecheck'));
  if (scripts['type-check']) candidates.push(runScript('type-check'));
  if (scripts.lint) candidates.push(runScript('lint'));
  if (scripts.test) candidates.push(testCmd);
  if (scripts.build) candidates.push(runScript('build'));

  return [install, ...dedupe(candidates)];
}

// Emit a fail-fast init.sh that echoes and runs each verify command in turn.
// The literal `set -e` line is what makes the script abort on the first failure.
export function initScriptFromCommands(commands) {
  const steps = commands
    .map((cmd) => `echo "--- ${cmd.replaceAll('"', '\\"')} ---"\n${cmd}`)
    .join('\n\n');
  return `#!/bin/bash
set -e

echo "=== harness init ==="

${steps}

echo "=== verification complete ==="
echo ""
echo "Next steps:"
echo "  1. Read feature_list.json for the current feature state."
echo "  2. Pick the ONE in_progress feature (or the next not_started one)."
echo "  3. Implement only that feature, then re-run this script before claiming done."
`;
}

// --- five-subsystem scoring + hard invariant gate ---------------------------
// The keyword checks are advisory (they confirm the right artifacts exist and say
// the right things). The feature-list invariants are a HARD gate: a done feature
// without evidence/verification, a WIP breach, a bad status, or a dangling
// dependency fails the harness regardless of the keyword score.
export function scoreHarness(files) {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const text = (...keys) => { for (const k of keys) { const v = byPath.get(k); if (v) return v; } return ''; };
  const agents = text('AGENTS.md', 'CLAUDE.md');
  const featureList = text('feature_list.json', 'feature-list.json');
  const progress = text('progress.md', 'claude-progress.md');
  const init = text('init.sh');
  const handoff = text('session-handoff.md');
  const initFile = files.find((file) => file.path === 'init.sh');
  const initExecutable = Boolean(initFile && initFile.executable);
  const routesToDocs = files.some((file) => file.path.startsWith('docs/'));

  let fl = { parsed: false, flags: { structural: false, enum: false, evidenceGate: false, wip: false, dependencies: false, hasVerifiedDone: false }, errors: [] };
  if (featureList) {
    try {
      const r = checkFeatureList(JSON.parse(featureList));
      fl = { parsed: true, flags: r.flags, errors: r.errors };
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
      { pass: routesToDocs || textHas(agents, ['feature_list.json', 'progress.md']).pass, message: 'State/docs routed from instructions (feature_list.json, progress.md, or docs/)' },
    ],
    state: [
      hasFile(byPath, ['feature_list.json', 'feature-list.json'], 'Feature tracker exists'),
      { pass: fl.parsed && f.structural && f.enum, message: 'Feature tracker is valid JSON with canonical fields and status enum' },
      hasFile(byPath, ['progress.md', 'claude-progress.md'], 'Progress log exists'),
      textHas(progress, ['Current State', 'What', 'Next'], 'Progress log supports restart'),
      textHas(handoff || progress, ['Blockers', 'Files', 'Next Session'], 'Handoff captures blockers/files/next step'),
    ],
    verification: [
      hasFile(byPath, ['init.sh'], 'Verification entrypoint exists'),
      { pass: initFailsFast(init) && initExecutable, message: 'init.sh fails fast (set -e on a real line) and is executable' },
      textHas(init + agents, ['test', 'pytest', 'vitest', 'cargo test', 'go test', 'dotnet test'], 'Test command documented'),
      textHas(init + agents, ['build', 'type', 'lint', 'compile'], 'Static/build check documented'),
      { pass: f.hasVerifiedDone || textHas(handoff, ['Verification Evidence']).pass, message: 'Verification evidence recorded (a done feature carries evidence, or handoff has an evidence table)' },
    ],
    scope: [
      textHas(agents, ['One feature at a time', 'one-feature-at-a-time', 'one feature'], 'One-feature-at-a-time rule documented'),
      { pass: fl.parsed && f.wip, message: 'At most one feature is in_progress (WIP cap holds)' },
      { pass: fl.parsed && f.evidenceGate, message: 'No feature is marked done without evidence + verification' },
      { pass: fl.parsed && f.dependencies, message: 'Feature dependencies resolve to real ids' },
      textHas(agents, ['Stay in scope', 'scope'], 'Scope boundary documented'),
    ],
    lifecycle: [
      hasFile(byPath, ['init.sh'], 'Startup script exists'),
      textHas(agents, ['End of Session', 'Before ending'], 'End-of-session procedure exists'),
      hasFile(byPath, ['session-handoff.md'], 'Session handoff template exists'),
      textHas(progress + handoff, ['Last Updated', 'Current Objective', 'Recommended Next Step'], 'Session restart markers exist'),
      textHas(agents + init, ['restartable', 'clean', 'Next steps'], 'Clean restart path documented'),
    ],
  };

  const subsystems = Object.fromEntries(Object.entries(checks).map(([name, list]) => {
    const passed = list.filter((c) => c.pass).length;
    return [name, { score: Math.max(1, Math.round((passed / list.length) * 5)), passed, total: list.length, checks: list }];
  }));

  const sum = Object.values(subsystems).reduce((acc, s) => acc + s.score, 0);
  const overall = Math.round((sum / (SUBSYSTEMS.length * 5)) * 100);
  const bottleneck = Object.entries(subsystems).sort((a, b) => a[1].score - b[1].score)[0][0];

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
  return { pass: names.some((n) => byPath.has(n)), message };
}
function textHas(haystack, needles, message) {
  const lower = haystack.toLowerCase();
  return { pass: needles.some((n) => lower.includes(n.toLowerCase())), message };
}
// A comment mentioning "set -euo pipefail" must NOT count — only a real,
// non-comment `set -e[...]` line actually aborts the script on failure.
function initFailsFast(content) {
  return content.split('\n').some((line) => {
    const t = line.trim();
    return t && !t.startsWith('#') && /^set\s+-[a-z]*e/i.test(t);
  });
}

export async function loadHarnessFiles(root) {
  const rootCandidates = [
    'AGENTS.md', 'CLAUDE.md', 'feature_list.json', 'feature-list.json',
    'progress.md', 'claude-progress.md', 'session-handoff.md', 'clean-state-checklist.md', 'init.sh',
  ];
  // A few conventional docs so "routes into docs/" is visible to the scorer.
  const docCandidates = [
    'docs/ARCHITECTURE.md', 'docs/PRODUCT.md', 'docs/RELIABILITY.md',
    'docs/DESIGN.md', 'docs/SECURITY.md', 'ARCHITECTURE.md',
  ];
  const files = [];
  for (const candidate of [...rootCandidates, ...docCandidates]) {
    const full = path.join(root, candidate);
    if (!(await exists(full))) continue;
    let executable = false;
    try { executable = ((await stat(full)).mode & 0o111) !== 0; } catch { executable = false; }
    files.push({ path: candidate, content: await readText(full), executable });
  }
  return files;
}

// --- reporting --------------------------------------------------------------
export function formatScoreReport(result, root = '.') {
  const lines = [
    `Harness validation for ${root}`,
    `Overall: ${result.overall}/100`,
    `Bottleneck: ${result.bottleneck}`,
    `Invariant gate: ${result.gate?.passed === false ? 'FAIL' : 'PASS'}`,
    '',
  ];
  if (result.gate?.passed === false) {
    lines.push('Hard invariant violations (these fail the harness regardless of score):');
    for (const v of result.gate.violations) lines.push(`  GATE ${v}`);
    lines.push('');
  }
  for (const [name, subsystem] of Object.entries(result.subsystems)) {
    lines.push(`${name}: ${subsystem.score}/5 (${subsystem.passed}/${subsystem.total})`);
    for (const check of subsystem.checks) lines.push(`  ${check.pass ? 'PASS' : 'FAIL'} ${check.message}`);
    lines.push('');
  }
  return lines.join('\n');
}

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export function htmlReport(result, title = 'Harness Assessment') {
  const sections = Object.entries(result.subsystems).map(([name, subsystem]) => {
    const items = subsystem.checks
      .map((c) => `<li class="${c.pass ? 'pass' : 'fail'}">${c.pass ? 'PASS' : 'FAIL'} ${escapeHtml(c.message)}</li>`)
      .join('');
    return `    <section><h2>${escapeHtml(name)} <span>${subsystem.score}/5</span></h2><ul>${items}</ul></section>`;
  }).join('\n');

  const gateBadge = result.gate?.passed === false ? 'FAIL' : 'PASS';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #16202a; background: #f6f8fb; }
    main { max-width: 960px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    .summary { display: flex; gap: 14px; flex-wrap: wrap; margin: 18px 0; }
    .metric { background: #fff; border: 1px solid #d7dde6; border-radius: 10px; padding: 14px 18px; min-width: 170px; }
    .metric strong { display: block; font-size: 26px; margin-top: 4px; }
    section { background: #fff; border: 1px solid #d7dde6; border-radius: 10px; margin: 12px 0; padding: 14px 18px; }
    h2 { margin: 0 0 10px; font-size: 19px; display: flex; justify-content: space-between; }
    ul { margin: 0; padding-left: 20px; } li { margin: 6px 0; }
    .pass { color: #15724a; } .fail { color: #a32a20; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <p>Five-subsystem harness assessment.</p>
      <div class="summary">
        <div class="metric">Overall<strong>${result.overall}/100</strong></div>
        <div class="metric">Bottleneck<strong>${escapeHtml(result.bottleneck)}</strong></div>
        <div class="metric">Invariant gate<strong>${gateBadge}</strong></div>
      </div>
    </header>
${sections}
  </main>
</body>
</html>
`;
}
