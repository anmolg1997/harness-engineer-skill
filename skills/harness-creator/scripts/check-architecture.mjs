#!/usr/bin/env node
// Config-driven architecture/boundary guard. Turns "remembered" layering rules
// ("the renderer must never import fs") into a mechanical check the agent can't
// rationalize past. Language-agnostic: rules are glob + regex, so it works for
// any stack.
//
//   node check-architecture.mjs [--target DIR] [--config PATH] [--json]
//
// Reads a JSON config (default: <target>/.harness/architecture.json). Each rule
// names path globs and forbidden line patterns. Exit code is non-zero on any
// violation. If no config exists, it prints how to add one and exits 0 (no-op),
// so it is safe to wire into CI unconditionally. Node built-ins only.
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.venv', 'venv', '__pycache__', 'coverage', 'target', '.scratch']);
const MAX_SCAN_BYTES = 512 * 1024;
const DEFAULT_CONFIG_REL = '.harness/architecture.json';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) { args._.push(token); continue; }
    const key = token.slice(2);
    if (argv[i + 1] && !argv[i + 1].startsWith('--')) { args[key] = argv[i + 1]; i += 1; }
    else args[key] = true;
  }
  return args;
}

// Minimal glob -> RegExp supporting ** (any depth), * (within a segment), ?.
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i += 1; if (glob[i + 1] === '/') i += 1; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('.+^${}()|[]\\'.includes(c)) re += `\\${c}`;
    else re += c;
  }
  return new RegExp(`^${re}$`);
}

async function walk(root) {
  const out = [];
  async function recurse(dir, rel) {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await recurse(path.join(dir, entry.name), relPath);
      else if (entry.isFile()) out.push(relPath);
    }
  }
  await recurse(root, '');
  return out;
}

export function compileRules(config) {
  return (config.rules || []).map((rule) => ({
    name: rule.name || 'unnamed rule',
    remediation: rule.remediation || '',
    matchers: (rule.paths || []).map(globToRegExp),
    forbid: (rule.forbid || []).map((pattern) => new RegExp(pattern))
  }));
}

export async function checkArchitecture(root, config) {
  const rules = compileRules(config);
  const files = await walk(root);
  const violations = [];
  for (const rel of files) {
    const applicable = rules.filter((rule) => rule.matchers.some((m) => m.test(rel)));
    if (applicable.length === 0) continue;
    let content = '';
    try {
      if ((await stat(path.join(root, rel))).size > MAX_SCAN_BYTES) continue;
      content = await readFile(path.join(root, rel), 'utf8');
    } catch { continue; }
    const lines = content.split('\n');
    for (const rule of applicable) {
      lines.forEach((line, i) => {
        for (const pattern of rule.forbid) {
          if (pattern.test(line)) {
            violations.push({ file: `${rel}:${i + 1}`, rule: rule.name, pattern: String(pattern), remediation: rule.remediation });
          }
        }
      });
    }
  }
  return { ok: violations.length === 0, violations, ruleCount: rules.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = path.resolve(args.target || args._[0] || process.cwd());
  const configPath = path.resolve(args.config || path.join(target, DEFAULT_CONFIG_REL));

  if (!existsSync(configPath)) {
    console.log(`No architecture config at ${path.relative(target, configPath) || configPath}.`);
    console.log('Add one to enforce layer boundaries mechanically. Example:');
    console.log(JSON.stringify({
      rules: [
        { name: 'renderer must not use node builtins', paths: ['src/renderer/**'], forbid: ["\\b(fs|path|os|child_process)\\b", "from 'electron'"], remediation: 'Route through the preload bridge.' },
        { name: 'services must not import UI', paths: ['src/services/**'], forbid: ["from 'react'"], remediation: 'Keep services UI-agnostic.' }
      ]
    }, null, 2));
    process.exit(0);
  }

  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (error) {
    console.error(`FAIL: could not parse ${configPath} (${error.message}).`);
    process.exit(1);
  }

  const result = await checkArchitecture(target, config);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Architecture check: ${target} (${result.ruleCount} rule(s))`);
    for (const v of result.violations) {
      console.log(`  VIOLATION ${v.file} — ${v.rule}${v.remediation ? ` (${v.remediation})` : ''}`);
    }
    console.log(result.ok ? 'PASS (no boundary violations)' : `FAIL (${result.violations.length} violation(s))`);
  }
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
