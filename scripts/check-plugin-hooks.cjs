#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn, execFileSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const pluginId = 'wms-governance@wms-local';
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wms-hooks-check-'));
const env = { ...process.env, CODEX_HOME: home };
const pending = new Map();
let server;
let nextId = 0;

function cli(args) {
  return execFileSync('codex', args, { cwd: repo, env, encoding: 'utf8', timeout: 30000 });
}

function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out: ${method}`));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    server.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
}

async function main() {
  console.log(cli(['--version']).trim());
  cli(['plugin', 'marketplace', 'add', repo]);
  const installed = JSON.parse(cli(['plugin', 'add', pluginId, '--json']));
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'plugins/wms-governance/.codex-plugin/plugin.json'), 'utf8'));
  assert.equal(installed.version, manifest.version);

  server = spawn('codex', ['app-server', '--stdio'], { cwd: repo, env, stdio: ['pipe', 'pipe', 'ignore'] });
  function failRequests(error) {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
  }
  server.on('error', failRequests);
  server.on('exit', () => failRequests(new Error('App server exited')));
  readline.createInterface({ input: server.stdout }).on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    const item = pending.get(message.id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(message.id);
    if (message.error) item.reject(new Error(JSON.stringify(message.error)));
    else item.resolve(message.result);
  });

  await request('initialize', {
    clientInfo: { name: 'wms-hooks-check', version: '1.0.0' },
    capabilities: { experimentalApi: true },
  });
  server.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
  const result = await request('hooks/list', { cwds: [repo] });
  const entry = result.data.find(item => path.resolve(item.cwd) === repo);
  assert(entry, 'Missing hooks response for repository');
  assert.deepEqual(entry.errors, [], 'Hook discovery errors');
  const hooks = entry.hooks.filter(item => item.pluginId === pluginId);
  assert.deepEqual(hooks.map(item => item.eventName).sort(), ['sessionEnd', 'sessionStart', 'stop', 'userPromptSubmit']);
  assert(hooks.every(item => item.enabled && item.trustStatus === 'untrusted'));
  const { plugin } = await request('plugin/read', {
    marketplacePath: path.join(repo, '.agents/plugins/marketplace.json'),
    pluginName: 'wms-governance',
  });
  assert.deepEqual(plugin.skills.map(item => item.name).sort(), [
    'wms-code-review', 'wms-delivery', 'wms-develop',
    'wms-security-and-hardening', 'wms-security-review', 'wms-setup',
  ].map(name => `wms-governance:${name}`));
  assert(plugin.skills.every(item => item.enabled));
  console.log(`PASS: WMS ${installed.version}; four enabled hooks discovered before trust; six enabled skills.`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  if (server && server.exitCode === null && server.signalCode === null) {
    await new Promise(resolve => { server.once('exit', resolve); server.kill(); });
  }
  const target = fs.realpathSync(home);
  assert.equal(path.dirname(target), fs.realpathSync(os.tmpdir()));
  assert(path.basename(target).startsWith('wms-hooks-check-'));
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
