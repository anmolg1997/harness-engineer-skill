#!/usr/bin/env node
// Structural harness benchmark: scores the target harness, measures eval-suite
// coverage, and emits a JSON (and optional HTML) report. This is a STRUCTURAL
// signal — it confirms the harness is present, coherent, and well-specified. It
// does not replace real before/after agent sessions on representative tasks.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatScoreReport, htmlReport, loadHarnessFiles, parseArgs, readJson, scoreHarness, writeText,
} from './lib/harness-utils.mjs';

const args = parseArgs(process.argv.slice(2));
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (args.help) {
  console.log(`Usage: node scripts/run-benchmark.mjs [--target DIR] [--output FILE] [--html FILE] [--min-score N] [--min-eval-score N]

Scores the target harness + the eval suite's coverage and writes a JSON report.
Structural only — run real before/after agent sessions for behavioural proof.`);
  process.exit(0);
}

const target = path.resolve(args.target || args._[0] || process.cwd());
const output = path.resolve(args.output || path.join(target, 'harness-benchmark.json'));
const evalPath = path.resolve(args.evals || path.join(skillRoot, 'evals', 'evals.json'));

const harness = scoreHarness(await loadHarnessFiles(target));
const evals = await scoreEvalSuite(await readJson(evalPath));
const recommendation = recommend(harness, evals);

const report = { target, harness, evals, recommendation };
await writeText(output, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Benchmark report written to ${output}\n`);
console.log(formatScoreReport(harness, target));
console.log(`Eval coverage: ${evals.score}/100 (${evals.passed}/${evals.total} checks across ${evals.cases} cases)`);
console.log(`Recommendation: ${recommendation}`);

if (args.html) {
  const htmlPath = path.resolve(args.html);
  await writeText(htmlPath, renderHtml(report));
  console.log(`HTML benchmark written to ${htmlPath}`);
}

const minScore = Number(args.minScore || 70);
const minEval = Number(args.minEvalScore || 80);
if (harness.overall < minScore || harness.gate?.passed === false || evals.score < minEval) {
  process.exitCode = 1;
}

function scoreEvalSuite(json) {
  const cases = Array.isArray(json.evals) ? json.evals : [];
  const covers = (re) => cases.some((c) => re.test(c.name || ''));
  const checks = [
    { pass: cases.length >= 10, message: 'At least 10 eval cases' },
    { pass: covers(/minimal|creation/i), message: 'Covers minimal harness creation' },
    { pass: covers(/session|continuity/i), message: 'Covers session continuity' },
    { pass: covers(/assessment|score|recognition|coverage/i), message: 'Covers harness assessment' },
    { pass: covers(/verification|evidence|gate/i), message: 'Covers verification workflow' },
    { pass: covers(/memory/i), message: 'Covers memory taxonomy' },
    { pass: covers(/tool|permission|safety/i), message: 'Covers tool safety' },
    { pass: covers(/multi-agent|delegation|coordination/i), message: 'Covers multi-agent coordination' },
    { pass: cases.every((c) => c.prompt && c.expected_output && Array.isArray(c.expectations)), message: 'Each eval has prompt, expected output, expectations' },
    { pass: cases.every((c) => (c.expectations?.length ?? 0) >= 3), message: 'Each eval has at least three expectation checks' },
  ];
  const passed = checks.filter((c) => c.pass).length;
  return { score: Math.round((passed / checks.length) * 100), passed, total: checks.length, cases: cases.length, checks };
}

function recommend(harness, evals) {
  if (harness.gate?.passed === false) return 'Fix the hard invariant violations before benchmarking agent behaviour.';
  if (harness.overall >= 85 && evals.score >= 90) return 'Ready for realistic before/after agent-session benchmarking.';
  if (harness.overall < 70) return `Strengthen the ${harness.bottleneck} subsystem before benchmarking agent behaviour.`;
  if (evals.score < 80) return 'Expand eval coverage before treating benchmark results as representative.';
  return 'Usable, with some gaps worth tightening after the first real sessions.';
}

const esc = (v) => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function renderHtml(report) {
  const evalItems = report.evals.checks
    .map((c) => `<li class="${c.pass ? 'pass' : 'fail'}">${c.pass ? 'PASS' : 'FAIL'} ${esc(c.message)}</li>`)
    .join('');
  const extra = `    <section><h2>Eval coverage <span>${report.evals.score}/100</span></h2>`
    + `<p>${report.evals.passed}/${report.evals.total} checks across ${report.evals.cases} cases.</p><ul>${evalItems}</ul></section>\n`
    + `    <section><h2>Recommendation</h2><p>${esc(report.recommendation)}</p></section>\n  </main>`;
  return htmlReport(report.harness, `Harness Benchmark: ${path.basename(report.target)}`).replace('  </main>', extra);
}
