'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');

function git(cwd, args, encoding = 'utf8') {
  return execFileSync('git', args, { cwd, encoding, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}
function root(cwd) { return git(cwd, ['rev-parse', '--show-toplevel']).trim(); }
const rules = [
  ['private-key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g],
  ['provider-token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{16,}|(?:AKIA|ASIA)[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|(?:sk|rk)_live_[A-Za-z0-9]{16,}|npm_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{16,})\b/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
  ['authorization', /\b(?:Bearer|Basic)[ \t]+(?!<|\[REDACTED)[A-Za-z0-9_./+~=-]{12,}/gi],
  ['credential-url', /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/gi],
  ['credential-assignment', /(?:^|[^\p{L}\p{N}_-])["']?(?:password|passwd|pwd|api[_ -]?key|apikey|secret|client[_ -]?secret|(?:access[_ -]?|refresh[_ -]?)?token|accountkey|sharedaccesskey|密码|密钥|令牌)["']?[ \t]*[:=：][ \t]*("(?:\\.|[^"\\])+"|'(?:\\.|[^'\\])+'|[^\s"',;{}<>&，。；、]+)/gimu],
];
function placeholder(value) {
  const v = value.replace(/^["']|["']$/g, '');
  return /^(?:<[^>]+>|\[[A-Z_]+\]|\$\{[^}]+\}|process\.env\.[A-Z_][A-Z0-9_]*|changeme|placeholder|example|your[_-].*|test-token)$/i.test(v);
}
function inspect(text) {
  const findings = [];
  for (const [rule, regex] of rules) {
    regex.lastIndex = 0;
    for (const hit of text.matchAll(regex)) {
      if (placeholder(hit[1] || hit[0])) continue;
      findings.push({ rule, line: text.slice(0, hit.index).split('\n').length });
    }
  }
  return findings;
}
function scan(cwd, scope = 'diff') {
  if (!['diff', 'staged', 'all'].includes(scope)) throw new Error('Invalid scope');
  const repo = root(cwd);
  let files;
  if (scope === 'staged') files = git(repo, ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']).split('\0');
  else if (scope === 'all') files = git(repo, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0');
  else {
    let tracked;
    try { tracked = git(repo, ['diff', 'HEAD', '--name-only', '-z', '--diff-filter=ACMR']); }
    catch {
      // An unborn repository has no HEAD; include its index and untracked files.
      try { git(repo, ['rev-parse', '--verify', 'HEAD']); } catch {
        tracked = git(repo, ['ls-files', '--cached', '-z']);
      }
      if (tracked === undefined) throw new Error('Cannot enumerate diff');
    }
    files = (tracked + git(repo, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0');
  }
  const findings = [];
  let scanned = 0;
  for (const file of new Set(files.filter(Boolean))) {
    let content;
    if (scope === 'staged') {
      const mode = git(repo, ['ls-files', '--stage', '--', file]);
      if (!mode.startsWith('100')) { findings.push({ file, rule: 'unsupported-index-entry', line: 1 }); continue; }
      content = git(repo, ['show', `:${file}`], null);
    } else {
      const absolute = path.resolve(repo, file);
      const rel = path.relative(repo, absolute);
      if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path outside repository');
      const stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
      if (!stat) continue;
      if (!stat.isFile() || stat.isSymbolicLink()) { findings.push({ file, rule: 'unsupported-file-entry', line: 1 }); continue; }
      content = fs.readFileSync(absolute);
    }
    // Never silently mark large files as clean. Binary files are outside text scanning.
    if (content.length > 8 * 1024 * 1024) { findings.push({ file, rule: 'file-too-large', line: 1 }); continue; }
    if (content.includes(0)) continue;
    scanned++;
    findings.push(...inspect(content.toString('utf8')).map(f => ({ file, ...f })));
  }
  return { scope, scanned, findings };
}
function settings(repo) {
  const s = JSON.parse(fs.readFileSync(path.join(repo, 'governance/settings.json'), 'utf8'));
  if (!['open', 'standard', 'strict', 'locked'].includes(s.level) || typeof s.blockPromptSecrets !== 'boolean') throw new Error('Invalid settings');
  return s;
}
function threats(prompt) {
  return [
    ['instruction-override', /ignore\s+(previous|all|above)\s+(instructions?|rules?)|忽略.{0,6}(指令|规则)/i],
    ['destructive-command', /rm\s+-rf\s+\/|drop\s+database|truncate\s+table|删除所有.{0,6}(数据|文件)/i],
    ['privilege-escalation', /\bsudo\b|chmod\s+777|管理员权限/i],
    ['data-exfiltration', /upload.{0,40}(credentials|secrets)|send\s+all.{0,40}external|上传.{0,10}(凭据|密钥)/i],
  ].filter(([, re]) => re.test(prompt)).map(([rule]) => rule);
}
function audit(repo, event, details = {}) {
  // Hash runtime identifiers before using them in a filename; never log the prompt.
  const session = crypto.createHash('sha256').update(event.session_id).digest('hex').slice(0, 24);
  const dir = path.join(repo, 'logs/codex/governance');
  fs.mkdirSync(dir, { recursive: true });
  const record = { timestamp: new Date().toISOString(), session_id: event.session_id,
    turn_id: event.turn_id || null, event: event.hook_event_name, policy_version: '0.1.0', ...details };
  fs.appendFileSync(path.join(dir, `${session}.jsonl`), JSON.stringify(record) + '\n', { mode: 0o600 });
}
module.exports = { git, root, inspect, scan, settings, threats, audit };
