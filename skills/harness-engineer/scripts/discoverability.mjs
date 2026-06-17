#!/usr/bin/env node
// The "Fresh Session Test": can a cold agent (zero prior context) orient itself
// from the repo alone? Grades the five cold-start questions from harness
// engineering's "repo is the system of record" principle:
//   1. What is this system?   2. How is it organized?   3. How do I run it?
//   4. How do I verify it?    5. Where are we now?
// Plus an instruction-hygiene advisory (is the agent file short + routing, or a
// monolith?). Where recognize.mjs asks "does a mechanism exist", this asks "can a
// newcomer actually find the answer". Self-contained: Node built-ins only.
//
//   node discoverability.mjs [--target DIR] [--json]
//
// Exit code: 0 always (advisory audit).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

function makeProbes(root) {
  const abs = (rel) => path.join(root, rel);
  const exists = (rel) => existsSync(abs(rel));
  const list = (rel) => { try { return readdirSync(abs(rel)); } catch { return []; } };
  const isDir = (rel) => { try { return readdirSync(abs(rel)), true; } catch { return false; } };
  const read = (rel) => { try { return readFileSync(abs(rel), 'utf8'); } catch { return ''; } };
  const firstExisting = (rels) => rels.find(exists) || null;
  const makeTarget = (re) => {
    const mk = firstExisting(['Makefile', 'makefile', 'GNUmakefile']);
    return mk && re.test(read(mk)) ? mk : null;
  };
  const pkgScripts = (() => { try { return Object.keys(JSON.parse(read('package.json')).scripts || {}); } catch { return []; } })();
  const instructionFile = firstExisting(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']);
  const numberedSpecs = () => list('specs').filter((d) => /^\d{3,}[-_]/.test(d) && (exists(`specs/${d}/tasks.md`) || exists(`specs/${d}/spec.md`)));
  return { exists, list, isDir, read, firstExisting, makeTarget, pkgScripts, instructionFile, numberedSpecs };
}

export function freshSessionTest(root) {
  const p = makeProbes(root);
  const instr = p.instructionFile ? p.read(p.instructionFile) : '';
  const readme = p.read(p.firstExisting(['README.md', 'README.rst', 'README.txt', 'readme.md']) || 'README.md');
  const hay = `${instr}\n${readme}`;
  const has = (re) => re.test(hay);

  const questions = [
    {
      id: 'what', label: 'What is this system?',
      via:
        (has(/^#+\s.*\n+[^\n#].{60,}/m) && `${p.firstExisting(['README.md']) || p.instructionFile || 'instruction file'} (overview prose)`)
        || (has(/##?\s*(overview|project overview|about|purpose|introduction)/i) && 'overview/purpose section')
        || null,
      rec: 'Add a one-paragraph overview (what the system does) to README.md or the agent file.',
    },
    {
      id: 'organized', label: 'How is it organized?',
      via:
        (p.exists('docs/architecture') && 'docs/architecture/')
        || p.firstExisting(['ARCHITECTURE.md', 'docs/ARCHITECTURE.md'])
        || (has(/##?\s*(architecture|repository structure|repo structure|project structure|file map|code (layout|style)|directory structure)/i) && 'architecture/structure section')
        || (has(/```[\s\S]*\b(src|lib|app|packages)\/[\s\S]*```/) && 'directory tree block')
        || null,
      rec: 'Document layout: an ARCHITECTURE.md, a docs/architecture/ dir, or a "Repository Structure" section.',
    },
    {
      id: 'run', label: 'How do I run it?',
      via:
        p.firstExisting(['init.sh'])
        || p.makeTarget(/^(run|dev|start|serve|up|install)[a-z0-9_-]*\s*:/im)
        || (['start', 'dev', 'serve'].some((s) => p.pkgScripts.includes(s)) && `package.json scripts: ${p.pkgScripts.filter((s) => ['start', 'dev', 'serve'].includes(s)).join('/')}`)
        || (has(/##?\s*(setup|getting started|quick ?start|installation|install|running|usage|setup commands|dev environment)/i) && 'setup/getting-started section')
        || p.firstExisting(['.devcontainer/devcontainer.json', '.devcontainer.json'])
        || null,
      rec: 'Make the run/setup path discoverable: an init.sh, a Makefile run/dev target, package.json start script, or a Setup section.',
    },
    {
      id: 'verify', label: 'How do I verify it?',
      via:
        p.makeTarget(/^(test|check|lint|verify|ci)[a-z0-9_-]*\s*:/im)
        || (['test', 'lint', 'check'].some((s) => p.pkgScripts.includes(s)) && `package.json scripts: ${p.pkgScripts.filter((s) => ['test', 'lint', 'check'].includes(s)).join('/')}`)
        || p.firstExisting(['.pre-commit-config.yaml', 'tox.ini', 'noxfile.py'])
        || ((/\[tool\.(pytest|ruff|mypy)/.test(p.read('pyproject.toml'))) && 'pyproject.toml test/lint config')
        || (has(/##?\s*(testing|verification|tests|how to test|running tests)/i) && 'testing/verification section')
        || null,
      rec: 'Expose the verify path: a Makefile test/lint target, package.json test script, or a Testing section.',
    },
    {
      id: 'where', label: 'Where are we now?',
      via:
        p.firstExisting(['progress.md', 'claude-progress.md', 'PROGRESS.md', 'session-handoff.md'])
        || (p.exists('.specify') && '.specify/ (active spec)')
        || (p.firstExisting(['.taskmaster/tasks/tasks.json']) && '.taskmaster/ task state')
        || (p.numberedSpecs().length && `specs/ (${p.numberedSpecs().length} feature dirs)`)
        || p.firstExisting(['feature_list.json'])
        || (has(/##?\s*(status|current state|current status|roadmap|state of)/i) && 'status/current-state section')
        || p.firstExisting(['CHANGELOG.md'])
        || null,
      rec: 'Make current state visible: a progress.md / session-handoff.md, a feature tracker, a Status section, or a CHANGELOG.',
    },
  ];

  for (const q of questions) q.answered = Boolean(q.via);
  const answered = questions.filter((q) => q.answered).length;
  const score = Math.round((answered / questions.length) * 100);

  // Instruction-file hygiene (advisory; not part of the 5-question score).
  const hygiene = [];
  if (!p.instructionFile) {
    hygiene.push('No AGENTS.md / CLAUDE.md — agents have no dedicated operating manual.');
  } else {
    const lines = instr.split('\n').length;
    const links = (instr.match(/\]\(([^)]+\.md|docs\/[^)]+)\)/g) || []).length;
    if (lines > 400 && links < 5) {
      hygiene.push(`${p.instructionFile} is ${lines} lines with only ${links} doc links — adopt progressive disclosure (route to docs/, add an index) so it is not a monolith.`);
    }
  }

  return { score, answered, total: questions.length, questions, hygiene, instructionFile: p.instructionFile };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log('Usage: node discoverability.mjs [--target DIR] [--json]\n\nFresh Session Test: can a cold agent orient itself from the repo alone? Grades the 5 cold-start questions + instruction hygiene.'); process.exit(0); }
  const target = path.resolve(args.target || args._[0] || process.cwd());
  const r = freshSessionTest(target);
  if (args.json) { console.log(JSON.stringify({ target, ...r }, null, 2)); process.exit(0); }

  console.log(`Fresh Session Test for ${target}`);
  console.log(`Score: ${r.score}/100  (${r.answered}/${r.total} cold-start questions answerable)\n`);
  for (const q of r.questions) {
    if (q.answered) console.log(`  OK   ${q.label.padEnd(26)} via ${q.via}`);
    else console.log(`  GAP  ${q.label.padEnd(26)} — ${q.rec}`);
  }
  if (r.hygiene.length) {
    console.log('\nInstruction hygiene:');
    for (const h of r.hygiene) console.log(`  • ${h}`);
  }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
