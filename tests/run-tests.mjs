#!/usr/bin/env node
// Behavioural test suite for the harness-creator scripts. The point of these
// tests is to lock the GREEN behaviour: the broken fixture must FAIL every gate
// and the good fixture must PASS. Node built-ins only; run with `node tests/run-tests.mjs`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFeatureList } from '../skills/harness-creator/scripts/validate-feature-list.mjs';
import { loadHarnessFiles, scoreHarness } from '../skills/harness-creator/scripts/lib/harness-utils.mjs';
import { scanCleanState } from '../skills/harness-creator/scripts/cleanup-scanner.mjs';
import { checkArchitecture, globToRegExp } from '../skills/harness-creator/scripts/check-architecture.mjs';
import { recognizeHarness } from '../skills/harness-creator/scripts/recognize.mjs';
import { freshSessionTest } from '../skills/harness-creator/scripts/discoverability.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(here, 'fixtures', name);

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name}`); }
}

console.log('validate-feature-list / checkFeatureList');
{
  const goodList = { features: [
    { id: 'feat-001', name: 'A', description: 'a', status: 'done', verification: ['npm test'], evidence: 'npm test -> 3 passing', testedAt: '2026-01-01T00:00:00Z' },
    { id: 'feat-002', name: 'B', description: 'b', dependencies: ['feat-001'], status: 'in_progress', verification: [], evidence: '' }
  ] };
  const good = checkFeatureList(goodList);
  check('valid list has no errors', good.errors.length === 0);
  check('valid list flags all green', good.flags.structural && good.flags.enum && good.flags.evidenceGate && good.flags.wip && good.flags.dependencies);

  const noEvidence = { features: [{ id: 'feat-001', name: 'A', description: 'a', status: 'done', verification: [], evidence: '' }] };
  check('done-without-evidence trips evidenceGate', checkFeatureList(noEvidence).flags.evidenceGate === false);

  const twoActive = { features: [
    { id: 'feat-001', name: 'A', description: 'a', status: 'in_progress' },
    { id: 'feat-002', name: 'B', description: 'b', status: 'in_progress' }
  ] };
  check('two in_progress trips WIP cap', checkFeatureList(twoActive).flags.wip === false);

  const badEnum = { features: [{ id: 'feat-001', name: 'A', description: 'a', status: 'in-progress' }] };
  check('hyphenated status trips enum flag', checkFeatureList(badEnum).flags.enum === false);

  const danglingDep = { features: [{ id: 'feat-001', name: 'A', description: 'a', status: 'not_started', dependencies: ['feat-999'] }] };
  check('dangling dependency trips dependencies flag', checkFeatureList(danglingDep).flags.dependencies === false);
}

console.log('validate-harness / scoreHarness');
{
  const bad = scoreHarness(await loadHarnessFiles(fixture('bad-harness')));
  const good = scoreHarness(await loadHarnessFiles(fixture('good-harness')));
  check('bad harness fails the invariant gate', bad.gate.passed === false);
  check('good harness passes the invariant gate', good.gate.passed === true);
  check('good harness scores higher than bad', good.overall > bad.overall);
  check('good harness scores 100', good.overall === 100);
}

console.log('cleanup-scanner / scanCleanState');
{
  const dirty = await scanCleanState(fixture('dirty'));
  const clean = await scanCleanState(fixture('good-harness'));
  check('dirty tree is not ok', dirty.ok === false);
  check('dirty tree finds the committed secret (critical)', dirty.counts.critical >= 1);
  check('dirty tree finds debug/temp leftovers (warnings)', dirty.counts.warning >= 2);
  check('clean tree is ok', clean.ok === true);
}

console.log('check-architecture / checkArchitecture + globToRegExp');
{
  check('glob ** matches nested path', globToRegExp('src/renderer/**').test('src/renderer/a/b.ts'));
  check('glob * does not cross segment', globToRegExp('src/*.ts').test('src/a/b.ts') === false);
  const config = { rules: [{ name: 'renderer no fs', paths: ['src/renderer/**'], forbid: ["\\bfs\\b", "from 'electron'"] }] };
  const result = await checkArchitecture(fixture('arch'), config);
  check('architecture violation detected', result.ok === false && result.violations.length >= 1);
}

console.log('recognize / recognizeHarness (descriptive coverage)');
{
  const alt = recognizeHarness(fixture('alt-harness'));
  check('alt-harness (Makefile/specs/pre-commit, no skill files) scores full coverage', alt.coverage === 100);
  check('alt-harness credits Makefile as the verify entrypoint', /Makefile/.test(alt.subsystems.verification_entrypoint.via || ''));
  check('alt-harness credits specs/ as a feature tracker', /specs\//.test(alt.subsystems.state_tracker.via || ''));
  check('alt-harness credits uv.lock as environment', /uv\.lock/.test(alt.subsystems.environment.via || ''));
  check('alt-harness credits opentelemetry as observability', /opentelemetry/.test(alt.subsystems.observability.via || ''));
  check('alt-harness credits ADRs as system-of-record', /decisions|adr/i.test(alt.subsystems.system_of_record.via || ''));

  const good = recognizeHarness(fixture('good-harness'));
  check('good-harness is recognized as well-harnessed (>=66 coverage)', good.coverage >= 66);

  const dirty = recognizeHarness(fixture('dirty'));
  check('a near-empty tree shows low coverage with listed gaps', dirty.coverage <= 45 && dirty.gaps.length >= 5);
}

console.log('discoverability / freshSessionTest (cold-start orientation)');
{
  const good = freshSessionTest(fixture('good-harness'));
  check('good-harness answers all 5 cold-start questions', good.score === 100);

  const alt = freshSessionTest(fixture('alt-harness'));
  check('alt-harness answers verify + where, but flags organized + run gaps',
    alt.questions.find((q) => q.id === 'verify').answered
    && alt.questions.find((q) => q.id === 'where').answered
    && !alt.questions.find((q) => q.id === 'organized').answered
    && !alt.questions.find((q) => q.id === 'run').answered);

  const dirty = freshSessionTest(fixture('dirty'));
  check('a near-empty tree answers nothing and flags missing instruction file',
    dirty.score === 0 && dirty.hygiene.some((h) => /AGENTS\.md/.test(h)));
}

console.log('');
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
