#!/usr/bin/env node
// Render the five-subsystem harness assessment for a repo as a standalone HTML
// file (a shareable view of validate-harness's output).
import path from 'node:path';
import { htmlReport, loadHarnessFiles, parseArgs, scoreHarness, writeText } from './lib/harness-utils.mjs';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log('Usage: node scripts/render-assessment-html.mjs [--target DIR] [--output FILE]\n\nRenders the five-subsystem harness assessment as a standalone HTML file.');
  process.exit(0);
}

const target = path.resolve(args.target || args._[0] || process.cwd());
const output = path.resolve(args.output || path.join(target, 'harness-assessment.html'));

const result = scoreHarness(await loadHarnessFiles(target));
await writeText(output, htmlReport(result, `Harness Assessment: ${path.basename(target)}`));

console.log(`HTML report written to ${output}`);
console.log(`Overall: ${result.overall}/100 (invariant gate: ${result.gate?.passed === false ? 'FAIL' : 'PASS'})`);
