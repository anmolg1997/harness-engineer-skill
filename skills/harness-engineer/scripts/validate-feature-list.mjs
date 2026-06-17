#!/usr/bin/env node
// Enforces the harness invariants a keyword scorer cannot see:
//   - a feature is `done` ONLY with non-empty evidence AND a verification step
//   - at most one feature is `in_progress` at a time (WIP cap, default 1)
//   - ids are unique and dependencies resolve to real ids
//   - status is one of the canonical enum values
// Exit code is non-zero when any hard invariant is violated, so it is safe to
// run in CI or a pre-commit hook. Node built-ins only; no dependencies.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const FEATURE_STATUSES = ['not_started', 'in_progress', 'blocked', 'done'];
const THIN_EVIDENCE_CHARS = 15;

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) { args._.push(token); continue; }
    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) args[key] = inlineValue;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) { args[key] = argv[i + 1]; i += 1; }
    else args[key] = true;
  }
  return args;
}

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

// Pure core: takes a parsed object, returns { errors, warnings }. Exported so
// the test suite and validate-harness can reuse it without spawning a process.
export function checkFeatureList(parsed, { maxWip = 1 } = {}) {
  const errors = [];
  const warnings = [];
  // Booleans the harness scorer reuses, so each invariant maps to one check
  // rather than being re-derived from error-string matching.
  const flags = { structural: true, enum: true, evidenceGate: true, wip: true, dependencies: true, hasVerifiedDone: false };
  const fail = (flag, message) => { flags[flag] = false; errors.push(message); };

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    flags.structural = false;
    return { errors: ['Top-level value must be a JSON object.'], warnings, flags };
  }
  if (!Array.isArray(parsed.features)) {
    flags.structural = false;
    return { errors: ['`features` must be an array.'], warnings, flags };
  }
  if (parsed.features.length === 0) {
    flags.structural = false;
    return { errors: ['`features` is empty; list at least one feature.'], warnings, flags };
  }

  const ids = new Set();
  let inProgress = 0;

  parsed.features.forEach((feature, index) => {
    const where = `feature[${index}]${feature && feature.id ? ` (${feature.id})` : ''}`;
    if (!feature || typeof feature !== 'object') {
      fail('structural', `${where}: must be an object.`);
      return;
    }
    if (!isNonEmptyString(feature.id)) fail('structural', `${where}: missing string \`id\`.`);
    else if (ids.has(feature.id)) fail('structural', `${where}: duplicate id \`${feature.id}\`.`);
    else ids.add(feature.id);

    if (!isNonEmptyString(feature.name)) fail('structural', `${where}: missing string \`name\`.`);
    if (!isNonEmptyString(feature.description)) fail('structural', `${where}: missing string \`description\`.`);

    if (!FEATURE_STATUSES.includes(feature.status)) {
      fail('enum', `${where}: status \`${feature.status}\` is not one of ${FEATURE_STATUSES.join(', ')}.`);
    }

    if (feature.status === 'in_progress') inProgress += 1;

    const verification = Array.isArray(feature.verification)
      ? feature.verification.filter(isNonEmptyString)
      : [];

    // The core invariant: done must be earned with evidence + a way it was checked.
    if (feature.status === 'done') {
      const hasEvidence = isNonEmptyString(feature.evidence);
      if (!hasEvidence) {
        fail('evidenceGate', `${where}: status is \`done\` but \`evidence\` is empty. Record the command and observed output, or set status back.`);
      } else if (feature.evidence.trim().length < THIN_EVIDENCE_CHARS) {
        warnings.push(`${where}: evidence is very short ("${feature.evidence.trim()}"). Prefer command + observed output.`);
      }
      if (verification.length === 0) {
        fail('evidenceGate', `${where}: status is \`done\` but \`verification\` lists no command/step. Done must be reproducible.`);
      }
      if (hasEvidence && verification.length > 0) flags.hasVerifiedDone = true;
      if (feature.testedAt === undefined || feature.testedAt === null) {
        warnings.push(`${where}: status is \`done\` but \`testedAt\` is not set.`);
      }
    }

    // Optional v2 fields — validated only when present (backward compatible).
    if (feature.priority !== undefined && !['low', 'medium', 'high', 'critical'].includes(feature.priority)) {
      warnings.push(`${where}: priority \`${feature.priority}\` is not one of low, medium, high, critical.`);
    }
    if (feature.subtasks !== undefined) {
      if (!Array.isArray(feature.subtasks)) {
        fail('structural', `${where}: \`subtasks\` must be an array.`);
      } else {
        feature.subtasks.forEach((st, si) => {
          if (!st || typeof st !== 'object') { fail('structural', `${where}: subtask[${si}] must be an object.`); return; }
          if (!isNonEmptyString(st.id)) fail('structural', `${where}: subtask[${si}] is missing a string \`id\`.`);
          if (!FEATURE_STATUSES.includes(st.status)) fail('enum', `${where}: subtask[${si}] status \`${st.status}\` is not one of ${FEATURE_STATUSES.join(', ')}.`);
        });
      }
    }
  });

  if (inProgress > maxWip) {
    fail('wip', `${inProgress} features are \`in_progress\`; the work-in-progress cap is ${maxWip}. Finish or block one before starting another.`);
  }

  // Dependency integrity (only meaningful once ids are collected).
  parsed.features.forEach((feature, index) => {
    if (!feature || !Array.isArray(feature.dependencies)) return;
    const where = `feature[${index}]${feature.id ? ` (${feature.id})` : ''}`;
    for (const dep of feature.dependencies) {
      if (!ids.has(dep)) fail('dependencies', `${where}: dependency \`${dep}\` does not match any feature id.`);
      else if (feature.status === 'done') {
        const depFeature = parsed.features.find((f) => f && f.id === dep);
        if (depFeature && depFeature.status !== 'done') {
          warnings.push(`${where}: marked \`done\` but depends on \`${dep}\` which is \`${depFeature.status}\`.`);
        }
      }
    }
  });

  return { errors, warnings, flags };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node scripts/validate-feature-list.mjs [--target DIR] [--file PATH] [--max-wip N] [--json]

Validates feature_list.json invariants:
  - done requires non-empty evidence AND a verification step
  - at most --max-wip (default 1) features in_progress
  - unique ids, resolvable dependencies, canonical status enum

Exit code is non-zero when any hard invariant is violated.`);
    process.exit(0);
  }

  const target = path.resolve(args.target || args._[0] || process.cwd());
  const file = args.file ? path.resolve(args.file) : path.join(target, 'feature_list.json');
  const maxWip = Number(args.maxWip ?? 1);

  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    console.error(`FAIL: feature list not found at ${file}`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error(`FAIL: ${path.basename(file)} is not valid JSON (${error.message}).`);
    process.exit(1);
  }

  const { errors, warnings } = checkFeatureList(parsed, { maxWip });

  if (args.json) {
    console.log(JSON.stringify({ file, ok: errors.length === 0, errors, warnings }, null, 2));
  } else {
    console.log(`Feature list: ${file}`);
    for (const warning of warnings) console.log(`  WARN  ${warning}`);
    for (const error of errors) console.log(`  ERROR ${error}`);
    console.log(errors.length === 0
      ? `PASS (${parsed.features?.length ?? 0} features, ${warnings.length} warning(s))`
      : `FAIL (${errors.length} error(s), ${warnings.length} warning(s))`);
  }

  process.exit(errors.length === 0 ? 0 : 1);
}

// Only run when invoked directly, so the pure core can be imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
