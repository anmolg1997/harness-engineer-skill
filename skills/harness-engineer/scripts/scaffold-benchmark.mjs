#!/usr/bin/env node
// Scaffold a before/after benchmark config (promptfoo) into a target repo. The
// structural harness benchmark (run-benchmark.mjs) confirms the harness is well
// formed; THIS gives you the behavioural half — an A/B harness to compare two
// prompts or two models on representative tasks and gate on assertions.
//
//   node scaffold-benchmark.mjs [--target DIR] [--force]
//
// Writes promptfooconfig.yaml (skipped if present unless --force). Run it with:
//   npx promptfoo@latest eval -c promptfooconfig.yaml   &&   npx promptfoo view
// Self-contained: Node built-ins only.
import { writeFile, access } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = { _: [] };
  const flags = new Set(['force', 'help', 'json']);
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (!t.startsWith('--')) { args._.push(t); continue; }
    const key = t.slice(2);
    if (flags.has(key)) { args[key] = true; continue; }
    if (argv[i + 1] && !argv[i + 1].startsWith('--')) { args[key] = argv[i + 1]; i += 1; }
    else args[key] = true;
  }
  return args;
}

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

export const PROMPTFOO_TEMPLATE = `# Before/after benchmark for a prompt or model change.
# Run:  npx promptfoo@latest eval -c promptfooconfig.yaml   &&   npx promptfoo view
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: "Before/after harness benchmark"

# The two things you are comparing (the BEFORE and the AFTER). Swap models here
# to A/B a model change, or keep one provider and vary 'prompts' to A/B a prompt.
providers:
  - id: anthropic:messages:claude-sonnet-4-6   # BEFORE
  - id: anthropic:messages:claude-opus-4-8     # AFTER

prompts:
  - "You are a coding agent. Complete this task precisely and verifiably:\\n\\n{{task}}"

# Assertions decide pass/fail. Mix deterministic checks (contains/latency/cost)
# with a model-graded rubric. Tighten these to your repo's definition of done.
defaultTest:
  assert:
    - type: llm-rubric
      value: "The response is correct, complete, stays in scope, and states how it was verified."
    - type: latency
      threshold: 8000

tests:
  - description: "Representative task 1"
    vars:
      task: "Replace with a real, representative task from your repository."
    assert:
      - type: contains
        value: "REPLACE-with-an-expected-token"
  - description: "Representative task 2 (an edge case that used to fail)"
    vars:
      task: "Replace with a known-hard case so the benchmark guards against regressions."
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scaffold-benchmark.mjs [--target DIR] [--force]\n\nWrites a starter promptfooconfig.yaml for before/after model/prompt benchmarking.');
    process.exit(0);
  }
  const target = path.resolve(args.target || args._[0] || process.cwd());
  const configPath = path.join(target, 'promptfooconfig.yaml');

  if (!args.force && await exists(configPath)) {
    console.log(`SKIP promptfooconfig.yaml already exists (use --force to overwrite): ${configPath}`);
    process.exit(0);
  }
  await writeFile(configPath, PROMPTFOO_TEMPLATE, 'utf8');
  console.log(`WROTE ${configPath}`);
  console.log('Next: edit the providers/prompts/tests, then run:');
  console.log('  npx promptfoo@latest eval -c promptfooconfig.yaml && npx promptfoo view');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
