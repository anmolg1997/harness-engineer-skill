#!/usr/bin/env node
// Idempotent "clean state" scanner. Reading-only: it never deletes anything, it
// reports. Run it at end of session or in CI to stop entropy (debug code, temp
// files, committed secrets) from accumulating across agent runs.
//
//   node cleanup-scanner.mjs [--target DIR] [--strict] [--json]
//
// Exit code: non-zero when any CRITICAL issue is found (or any issue with
// --strict). Self-contained: Node built-ins only, safe to copy into any repo.
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', '.nuxt', '.venv', 'venv',
  '__pycache__', 'coverage', '.turbo', 'target', '.cache', 'vendor', '.scratch'
]);
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.rb', '.php', '.sh', '.vue', '.svelte']);
const ENV_ALLOW = new Set(['.env.example', '.env.sample', '.env.template', '.env.dist']);
const MAX_SCAN_BYTES = 512 * 1024;

function parseArgs(argv) {
  const args = { _: [] };
  const booleanFlags = new Set(['strict', 'json', 'help']);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) { args._.push(token); continue; }
    const key = token.slice(2);
    if (booleanFlags.has(key)) { args[key] = true; continue; }
    if (argv[i + 1] && !argv[i + 1].startsWith('--')) { args[key] = argv[i + 1]; i += 1; }
    else args[key] = true;
  }
  return args;
}

async function walk(root) {
  const out = [];
  async function recurse(dir, rel) {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) {
          // A node_modules nested below the root is itself an issue worth noting.
          if (entry.name === 'node_modules' && rel) out.push({ rel: relPath, dir: true, nestedDeps: true });
          continue;
        }
        await recurse(full, relPath);
      } else if (entry.isFile()) {
        out.push({ rel: relPath, full });
      }
    }
  }
  await recurse(root, '');
  return out;
}

export async function scanCleanState(root, { strict = false } = {}) {
  const issues = [];
  const add = (severity, file, message) => issues.push({ severity, file, message });

  if (!existsSync(path.join(root, '.gitignore'))) {
    add('info', '.gitignore', 'No .gitignore at repo root; build artifacts and secrets can leak into commits.');
  }

  const files = await walk(root);
  for (const file of files) {
    if (file.nestedDeps) {
      add('critical', file.rel, 'Nested node_modules below the repo root (should not be committed/created here).');
      continue;
    }
    const base = path.basename(file.rel);
    const ext = path.extname(base).toLowerCase();

    // Temp / backup / editor leftovers.
    if (/\.(tmp|bak|swp|swo|orig)$/i.test(base) || base.endsWith('~')) {
      add('warning', file.rel, 'Temporary/backup file left in the tree.');
      continue;
    }
    // Log files in the source tree.
    if (ext === '.log') {
      add('warning', file.rel, 'Log file committed in the source tree.');
      continue;
    }
    // Real .env files (secrets), excluding sample/template variants.
    if (base === '.env' || (base.startsWith('.env.') && !ENV_ALLOW.has(base))) {
      add('critical', file.rel, 'Environment/secret file present; likely should be git-ignored, not committed.');
      continue;
    }

    // Content scan for debug leftovers in source files only.
    if (TEXT_EXTENSIONS.has(ext)) {
      let content = '';
      try {
        if ((await stat(file.full)).size > MAX_SCAN_BYTES) continue;
        content = await readFile(file.full, 'utf8');
      } catch { continue; }
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        const n = i + 1;
        if (/\bdebugger\s*;?/.test(line)) add('warning', `${file.rel}:${n}`, 'Leftover `debugger` statement.');
        else if (/console\.(log|debug)\s*\(/.test(line) && !/eslint|allow-console/.test(line)) add('warning', `${file.rel}:${n}`, 'Leftover console.log/debug call.');
        if (/\b(FIXME|HACK|XXX)\b/.test(line)) add('info', `${file.rel}:${n}`, 'FIXME/HACK/XXX marker.');
      });
    }
  }

  const critical = issues.filter((i) => i.severity === 'critical');
  const warning = issues.filter((i) => i.severity === 'warning');
  const ok = critical.length === 0 && (!strict || warning.length === 0);
  return { ok, issues, counts: { critical: critical.length, warning: warning.length, info: issues.length - critical.length - warning.length } };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = path.resolve(args.target || args._[0] || process.cwd());
  const result = await scanCleanState(target, { strict: Boolean(args.strict) });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Clean-state scan: ${target}`);
    const order = { critical: 0, warning: 1, info: 2 };
    for (const issue of [...result.issues].sort((a, b) => order[a.severity] - order[b.severity])) {
      console.log(`  ${issue.severity.toUpperCase().padEnd(8)} ${issue.file} — ${issue.message}`);
    }
    console.log(result.ok
      ? `CLEAN (${result.counts.critical} critical, ${result.counts.warning} warning, ${result.counts.info} info)`
      : `ISSUES (${result.counts.critical} critical, ${result.counts.warning} warning, ${result.counts.info} info)`);
  }
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
