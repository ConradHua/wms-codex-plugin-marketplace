#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./governance/core.cjs');
const source = path.resolve(__dirname, '../repository');
function canonical(p) {
  const value = fs.realpathSync.native(p);
  return process.platform === 'win32' ? value.toLowerCase() : value;
}
try {
  const args = process.argv.slice(2);
  if (args[0] !== '--target' || !args[1] || args.length > 3 || (args[2] && args[2] !== '--dry-run')) throw new Error('Use --target <repo> [--dry-run]');
  const target = fs.realpathSync.native(args[1]);
  if (canonical(root(target)) !== canonical(target)) throw new Error('Target must be a Git repository root');
  const pluginRoot = path.resolve(__dirname, '..');
  const rel = path.relative(pluginRoot, target);
  if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) throw new Error('Do not initialize plugin package');
  const localHooks = path.join(target, '.codex/hooks.json');
  if (fs.existsSync(localHooks) && fs.readFileSync(localHooks, 'utf8').includes('scripts/governance/hook.cjs')) throw new Error('Existing standalone WMS hooks; merge or remove duplicates manually');
  const files = [];
  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = path.join(prefix, entry.name);
      if (entry.isDirectory()) walk(path.join(dir, entry.name), name);
      else if (entry.isFile()) files.push(name);
      else throw new Error('Unsupported template entry');
    }
  }
  walk(source);
  for (const name of [...files, '.gitignore']) {
    for (let current = path.join(target, name); current !== target; current = path.dirname(current)) {
      if (fs.lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('Symlinked destination');
    }
    if (name !== '.gitignore' && fs.existsSync(path.join(target, name))) throw new Error(`Existing file: ${name}; merge manually`);
  }
  if (args[2] !== '--dry-run') {
    // Write activation last: incomplete setup must not activate runtime hooks.
    const marker = path.join('governance', 'plugin-activation.json');
    const ordered = [...files.filter(f => f !== marker), marker];
    for (const name of ordered) {
      const dest = path.join(target, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (name === marker) fs.appendFileSync(path.join(target, '.gitignore'), '\n# WMS Codex governance\n/logs/\n');
      fs.copyFileSync(path.join(source, name), dest, fs.constants.COPYFILE_EXCL);
    }
  }
  process.stdout.write(JSON.stringify({ dryRun: args[2] === '--dry-run', files }, null, 2) + '\n');
} catch (error) {
  process.stderr.write(`WMS setup refused: ${error.message}\n`);
  process.exitCode = 1;
}
