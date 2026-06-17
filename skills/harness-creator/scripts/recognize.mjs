#!/usr/bin/env node
// Descriptive harness auditor. Where validate-harness.mjs checks for THIS skill's
// own files, recognize.mjs asks the real question: "is each harness subsystem
// satisfied by ANY accepted mechanism?" It credits Makefile/justfile/Taskfile as
// a verify entrypoint, spec-kit/Taskmaster/agent-os/BMAD/specs as a feature
// tracker, pre-commit/CI/lint config as automated verification, lockfiles +
// runtime pins + devcontainer/devbox/nix as environment, OTel/Langfuse/Traceloop
// deps as observability, ADRs/llms.txt/architecture docs as system-of-record.
//
// This is what turns a false 28/100 on a well-harnessed repo into a true coverage
// score that surfaces only the genuine gaps. Self-contained: Node built-ins only.
//
//   node recognize.mjs [--target DIR] [--json]
//
// Exit code: 0 always (audit is advisory). Use validate-harness/validate-feature-list
// for the hard gates.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (!t.startsWith('--')) { args._.push(t); continue; }
    const key = t.slice(2);
    if (key === 'json' || key === 'help') { args[key] = true; continue; }
    if (argv[i + 1] && !argv[i + 1].startsWith('--')) { args[key] = argv[i + 1]; i += 1; }
    else args[key] = true;
  }
  return args;
}

// ---- filesystem probes (sync, targeted — no full walk, fast even on big repos) ----
function makeProbes(root) {
  const abs = (rel) => path.join(root, rel);
  const exists = (rel) => existsSync(abs(rel));
  const isDir = (rel) => { try { return statSync(abs(rel)).isDirectory(); } catch { return false; } };
  const list = (rel) => { try { return readdirSync(abs(rel)); } catch { return []; } };
  const read = (rel) => { try { return readFileSync(abs(rel), 'utf8'); } catch { return ''; } };
  const firstExisting = (rels) => rels.find(exists) || null;
  const dirHasFile = (dir, re) => list(dir).some((f) => re.test(f));

  // Concatenated manifest text for dependency substring checks.
  const manifestText = (() => {
    let blob = '';
    for (const f of ['pyproject.toml', 'requirements.txt', 'setup.cfg', 'Pipfile', 'environment.yml']) blob += '\n' + read(f);
    for (const reqs of ['requirements', 'requirements-dev.txt', 'requirements_dev.txt']) {
      if (isDir(reqs)) for (const f of list(reqs)) blob += '\n' + read(`${reqs}/${f}`);
    }
    const pkg = read('package.json');
    if (pkg) {
      try {
        const j = JSON.parse(pkg);
        blob += '\n' + Object.keys({ ...j.dependencies, ...j.devDependencies, ...j.peerDependencies }).join('\n');
      } catch { blob += '\n' + pkg; }
    }
    return blob.toLowerCase();
  })();
  const depPresent = (names) => names.find((n) => manifestText.includes(n.toLowerCase())) || null;

  const pkgScripts = (() => {
    try { return Object.keys(JSON.parse(read('package.json')).scripts || {}); } catch { return []; }
  })();

  // spec-kit / generic numbered spec dirs: specs/NNN-*/{spec,tasks}.md
  const numberedSpecDirs = () => list('specs').filter((d) => /^\d{3,}[-_]/.test(d) && isDir(`specs/${d}`)
    && (exists(`specs/${d}/tasks.md`) || exists(`specs/${d}/spec.md`)));

  return { abs, exists, isDir, list, read, firstExisting, dirHasFile, depPresent, pkgScripts, numberedSpecDirs };
}

// Each subsystem is satisfied if ANY recognizer returns evidence (a non-empty string).
function buildSubsystems(p) {
  const ci = () =>
    (p.isDir('.github/workflows') && p.dirHasFile('.github/workflows', /\.ya?ml$/) && '.github/workflows/')
    || p.firstExisting(['.gitlab-ci.yml', 'azure-pipelines.yml', 'Jenkinsfile', '.circleci/config.yml', '.drone.yml', 'bitbucket-pipelines.yml'])
    || (p.isDir('.azure-pipelines') && '.azure-pipelines/')
    || null;

  const makeTarget = () => {
    const mk = p.firstExisting(['Makefile', 'makefile', 'GNUmakefile']);
    if (mk && /^(test|lint|check|build|verify|ci|fmt|typecheck)[a-z0-9_-]*\s*:/im.test(p.read(mk))) return mk;
    return null;
  };

  return {
    instructions: [
      () => p.firstExisting(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md', '.cursorrules']),
      () => (p.isDir('.cursor/rules') && p.list('.cursor/rules').length && '.cursor/rules/') || null,
      () => (p.isDir('agent-os/standards') && 'agent-os/standards/') || null,
      () => p.firstExisting(['llms.txt', 'docs/llms.txt', 'public/llms.txt']),
    ],
    verification_entrypoint: [
      () => p.firstExisting(['init.sh']),
      () => makeTarget(),
      () => p.firstExisting(['justfile', 'Justfile', '.justfile', 'Taskfile.yml', 'Taskfile.yaml', 'tox.ini', 'noxfile.py']),
      () => (['test', 'check', 'lint', 'build', 'typecheck'].some((s) => p.pkgScripts.includes(s)) && `package.json scripts: ${p.pkgScripts.filter((s) => ['test', 'check', 'lint', 'build', 'typecheck'].includes(s)).join('/')}`) || null,
    ],
    verification_automated: [
      () => p.firstExisting(['.pre-commit-config.yaml', '.pre-commit-config.yml']),
      () => ci(),
      () => p.firstExisting(['ruff.toml', '.ruff.toml', 'mypy.ini', '.mypy.ini', '.flake8', '.eslintrc', '.eslintrc.json', '.eslintrc.js', 'eslint.config.js', 'eslint.config.mjs', 'biome.json', 'tsconfig.json']),
      () => ((/\[tool\.(ruff|mypy|pyright|pyrefly|pytest)/.test(p.read('pyproject.toml'))) && 'pyproject.toml [tool.ruff/mypy/pytest]') || null,
    ],
    state_tracker: [
      () => p.firstExisting(['feature_list.json', 'feature-list.json']),
      () => (p.isDir('.specify') && '.specify/ (spec-kit)') || (p.numberedSpecDirs().length && `specs/ (${p.numberedSpecDirs().length} numbered spec dirs)`) || null,
      () => p.firstExisting(['.taskmaster/tasks/tasks.json', '.taskmasterconfig']) && '.taskmaster/ (Taskmaster)',
      () => (p.isDir('agent-os/specs') && 'agent-os/specs/') || (p.isDir('_bmad') && '_bmad/ (BMAD)') || (p.exists('SPEC.md') && p.exists('.memlog.md') && 'SPEC.md + .memlog.md (BMAD)') || null,
      () => p.firstExisting(['TODO.md', 'TASKS.md', 'ROADMAP.md', 'docs/ROADMAP.md']),
    ],
    scope: [
      () => { const f = p.firstExisting(['AGENTS.md', 'CLAUDE.md']); return f && /one feature|in[_ ]progress|work in progress|stay in scope|scope boundar|definition of done/i.test(p.read(f)) ? `${f} (scope rules documented)` : null; },
      // A structured per-feature tracker (spec-kit / Taskmaster / numbered specs)
      // embeds scope/WIP discipline by construction — credit it as scope control.
      () => (p.isDir('.specify') && '.specify/ (spec-driven scope)') || (p.firstExisting(['.taskmaster/tasks/tasks.json', '.taskmasterconfig']) && '.taskmaster/ (per-task status)') || (p.numberedSpecDirs().length && 'specs/ (numbered, scoped features)') || null,
      () => (p.numberedSpecDirs().some((d) => /\[NEEDS CLARIFICATION/i.test(p.read(`specs/${d}/spec.md`))) && 'specs/ [NEEDS CLARIFICATION] markers') || null,
    ],
    lifecycle: [
      () => p.firstExisting(['session-handoff.md', 'HANDOFF.md', '.handoff.md']),
      () => p.firstExisting(['progress.md', 'claude-progress.md', 'PROGRESS.md']),
      () => { const f = p.firstExisting(['AGENTS.md', 'CLAUDE.md']); return f && /end of session|session handoff|clean[- ]state|before ending|leave .*restartable/i.test(p.read(f)) ? `${f} (lifecycle/handoff section)` : null; },
    ],
    environment: [
      () => p.firstExisting(['uv.lock', 'poetry.lock', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock', 'Cargo.lock', 'go.sum', 'Gemfile.lock', 'composer.lock']),
      () => p.firstExisting(['.nvmrc', '.tool-versions', '.mise.toml', 'mise.toml', '.python-version', 'rust-toolchain.toml', 'rust-toolchain']) || ((/requires-python/.test(p.read('pyproject.toml'))) && 'pyproject.toml requires-python') || null,
      () => p.firstExisting(['.devcontainer/devcontainer.json', '.devcontainer.json', 'devbox.json', 'flake.nix', 'shell.nix', 'default.nix']),
    ],
    observability: [
      () => { const d = p.depPresent(['opentelemetry', 'openinference', 'langfuse', 'traceloop', 'openllmetry', 'arize-phoenix', 'arize_phoenix', 'langsmith', 'agentops', 'logfire']); return d ? `dependency: ${d}` : null; },
      () => p.firstExisting(['otel-collector-config.yaml', 'otel-collector.yaml']),
    ],
    system_of_record: [
      () => (p.isDir('docs/decisions') && 'docs/decisions/ (ADRs)') || (p.isDir('docs/adr') && 'docs/adr/ (ADRs)') || (p.isDir('doc/adr') && 'doc/adr/ (ADRs)') || null,
      () => p.firstExisting(['llms.txt', 'docs/llms.txt']),
      () => (p.isDir('docs/architecture') && 'docs/architecture/') || p.firstExisting(['ARCHITECTURE.md', 'docs/ARCHITECTURE.md']),
      () => (p.isDir('docs') && p.list('docs').filter((f) => f.endsWith('.md')).length >= 3 && `docs/ (${p.list('docs').filter((f) => f.endsWith('.md')).length}+ markdown docs)`) || null,
    ],
  };
}

const LABELS = {
  instructions: 'Instructions',
  verification_entrypoint: 'Verification (entrypoint)',
  verification_automated: 'Verification (automated)',
  state_tracker: 'State / feature tracker',
  scope: 'Scope control',
  lifecycle: 'Lifecycle / handoff',
  environment: 'Environment (reproducibility)',
  observability: 'Observability',
  system_of_record: 'System-of-record / discoverability',
};

const RECS = {
  instructions: 'Add AGENTS.md (or CLAUDE.md) at the root as the agent operating manual.',
  verification_entrypoint: 'Expose a single verify entrypoint (init.sh, a Makefile `test`/`lint` target, or package.json scripts).',
  verification_automated: 'Wire automated checks: a .pre-commit-config.yaml and/or a CI workflow that runs lint + type-check + tests.',
  state_tracker: 'Track features/scope in a machine-readable tracker (feature_list.json, specs/NNN/tasks.md, or .taskmaster/).',
  scope: 'Document a one-feature-at-a-time / definition-of-done rule in the instruction file.',
  lifecycle: 'Add a session-handoff.md and progress.md (or an End-of-Session section) so sessions are restartable.',
  environment: 'Pin the environment: commit a lockfile, pin the runtime, and/or add a devcontainer.json / devbox.json / flake.nix.',
  observability: 'Add agent observability (OpenTelemetry gen_ai.* instrumentation, Langfuse, or Traceloop) so runs are traceable.',
  system_of_record: 'Capture the "why": ADRs under docs/decisions/, an architecture doc, and/or an llms.txt index.',
};

export function recognizeHarness(root) {
  const p = makeProbes(root);
  const subsystems = buildSubsystems(p);
  const result = {};
  for (const [name, recognizers] of Object.entries(subsystems)) {
    let via = null;
    for (const r of recognizers) {
      let evidence = null;
      try { evidence = r(); } catch { evidence = null; }
      if (evidence) { via = evidence; break; }
    }
    result[name] = { satisfied: Boolean(via), via };
  }
  const names = Object.keys(result);
  const satisfied = names.filter((n) => result[n].satisfied).length;
  const coverage = Math.round((satisfied / names.length) * 100);
  const gaps = names.filter((n) => !result[n].satisfied).map((n) => ({ subsystem: n, recommendation: RECS[n] }));
  return { coverage, satisfied, total: names.length, subsystems: result, gaps };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node recognize.mjs [--target DIR] [--json]\n\nDescriptive harness coverage audit: credits any accepted mechanism per subsystem and lists genuine gaps.');
    process.exit(0);
  }
  const target = path.resolve(args.target || args._[0] || process.cwd());
  const r = recognizeHarness(target);
  if (args.json) { console.log(JSON.stringify({ target, ...r }, null, 2)); process.exit(0); }

  console.log(`Harness coverage for ${target}`);
  console.log(`Coverage: ${r.coverage}/100  (${r.satisfied}/${r.total} subsystems satisfied)\n`);
  for (const [name, info] of Object.entries(r.subsystems)) {
    if (info.satisfied) console.log(`  OK   ${LABELS[name].padEnd(34)} via ${info.via}`);
    else console.log(`  GAP  ${LABELS[name].padEnd(34)} —`);
  }
  if (r.gaps.length) {
    console.log('\nGenuine gaps to close:');
    for (const g of r.gaps) console.log(`  • ${LABELS[g.subsystem]}: ${g.recommendation}`);
  } else {
    console.log('\nNo gaps: every subsystem is satisfied by some mechanism.');
  }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
