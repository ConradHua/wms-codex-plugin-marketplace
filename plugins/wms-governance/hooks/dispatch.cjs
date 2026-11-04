#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root } = require('../scripts/governance/core.cjs');
try {
  const input = fs.readFileSync(0, 'utf8');
  if (input.length > 2 * 1024 * 1024) throw new Error('Oversize event');
  const event = JSON.parse(input);
  if (!event || typeof event.cwd !== 'string') throw new Error('Invalid event');
  let repo;
  try { repo = root(event.cwd); } catch { process.stdout.write('{}\n'); process.exit(0); }
  const marker = path.join(repo, 'governance/plugin-activation.json');
  if (!fs.existsSync(marker)) { process.stdout.write('{}\n'); process.exit(0); }
  const activation = JSON.parse(fs.readFileSync(marker, 'utf8'));
  if (activation.enabled === false) { process.stdout.write('{}\n'); process.exit(0); }
  if (activation.plugin !== 'wms-governance' || activation.enabled !== true) throw new Error('Invalid activation');
  const localHooks = path.join(repo, '.codex/hooks.json');
  if (fs.existsSync(localHooks) && fs.readFileSync(localHooks, 'utf8').includes('scripts/governance/hook.cjs')) {
    throw new Error('Duplicate repository hooks');
  }
  const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/governance/hook.cjs')], {
    cwd: repo, input, encoding: 'utf8', timeout: 25000, maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error('Hook runtime failed');
  process.stdout.write(result.stdout);
} catch {
  process.stderr.write('WMS plugin hook failed; check activation, settings and duplicate repository hooks.\n');
  process.exitCode = 2;
}
