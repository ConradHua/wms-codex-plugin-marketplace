#!/usr/bin/env node
'use strict';
const { scan } = require('./core.cjs');
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && !['--staged', '--diff', '--all'].includes(args[0]))) throw new Error('Invalid arguments');
  const result = scan(process.cwd(), (args[0] || '--diff').slice(2));
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = result.findings.length ? 1 : 0;
} catch {
  process.stderr.write('Governance scan failed; check Git repository, readable files and arguments.\n');
  process.exitCode = 2;
}
