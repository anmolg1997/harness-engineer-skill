#!/usr/bin/env node
// Scaffold a minimal, working harness into a target repo: an agent instruction
// file, a feature tracker, a progress log, a session handoff, and a fail-fast
// init.sh wired to the project's real verify commands. Existing files are left
// alone unless --force is given.
import { chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  copyTemplate, detectPackageManager, detectProject, exists,
  initScriptFromCommands, parseArgs, verificationCommands, writeText,
} from './lib/harness-utils.mjs';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Usage: node scripts/create-harness.mjs [--target DIR] [--agent-file AGENTS.md|CLAUDE.md] [--package-manager npm|pnpm|yarn|bun] [--commands "cmd one,cmd two"] [--force]

Writes: AGENTS.md (or CLAUDE.md), feature_list.json, progress.md, session-handoff.md, init.sh.
Existing files are skipped unless --force is set.`);
  process.exit(0);
}

const target = path.resolve(args.target || args._[0] || process.cwd());
const agentFile = args.agentFile || 'AGENTS.md';
const force = Boolean(args.force);

const project = await detectProject(target);
project.packageManager = detectPackageManager(target, args.packageManager);

const commands = args.commands
  ? String(args.commands).split(',').map((c) => c.trim()).filter(Boolean)
  : verificationCommands(project, args.packageManager);

await mkdir(target, { recursive: true });

const purpose = project.stack === 'generic'
  ? 'Project harness for reliable agent-assisted development.'
  : `Project harness for reliable agent-assisted development in a ${project.stack} codebase.`;

const replacements = {
  AGENT_FILE_NAME: agentFile,
  PROJECT_PURPOSE: purpose,
  VERIFICATION_COMMANDS: commands.map((c) => `- \`${c}\``).join('\n'),
  PRIMARY_VERIFICATION_COMMAND: './init.sh',
};

const written = [];
written.push(await copyTemplate('agents.md', path.join(target, agentFile), replacements, { force }));
written.push(await copyTemplate('feature-list.json', path.join(target, 'feature_list.json'), {}, { force }));
written.push(await copyTemplate('progress.md', path.join(target, 'progress.md'), {}, { force }));
written.push(await copyTemplate('session-handoff.md', path.join(target, 'session-handoff.md'), {}, { force }));

const initPath = path.join(target, 'init.sh');
if (force || !(await exists(initPath))) {
  await writeText(initPath, initScriptFromCommands(commands));
  await chmod(initPath, 0o755);
  written.push({ path: initPath, status: 'written' });
} else {
  written.push({ path: initPath, status: 'skipped', reason: 'exists' });
}

console.log(`Created harness for ${target}`);
console.log(`Detected stack: ${project.stack}`);
console.log('Verification commands:');
for (const c of commands) console.log(`  - ${c}`);
console.log('');
for (const r of written) {
  console.log(`${r.status.toUpperCase()} ${path.relative(target, r.path)}${r.reason ? ` (${r.reason})` : ''}`);
}
