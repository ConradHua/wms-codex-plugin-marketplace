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
  ['provider-token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{16,}|(?:AKIA|ASIA)[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]{12,}|npm_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{16,})\b/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
  ['authorization', /\b(?:Bearer|Basic)[ \t]+(?!<|\[REDACTED)[A-Za-z0-9_./+~=-]{12,}/gi],
  ['credential-url', /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/gi],
  ['credential-assignment', /(?:^|[^\p{L}\p{N}_-])["']?(?:password|passwd|pwd|(?:proxy[_ -]?)?authorization|x[_ -]?api[_ -]?key|api[_ -]?key|apikey|secret(?:[_ -]?key)?|client[_ -]?secret|(?:access[_ -]?|refresh[_ -]?|id[_ -]?)?token|aws[_ -]?access[_ -]?key[_ -]?id|aws[_ -]?secret[_ -]?access[_ -]?key|accountkey|sharedaccesskey|sharedaccesssignature|sig|密码|密钥|令牌)["']?[ \t]*[:=：][ \t]*("(?:\\.|[^"\\])+"|'(?:\\.|[^'\\])+'|[^\s"',;{}<>&，。；、]+)/gimu],
];
const credentialFields = String.raw`(?:password|passwd|pwd|(?:proxy[ _-]?)?authorization|x[ _-]?api[ _-]?key|api[ _-]?key|apikey|secret(?:[ _-]?key)?|client[ _-]?secret|(?:access[ _-]?|refresh[ _-]?|id[ _-]?)?token|aws[ _-]?access[ _-]?key[ _-]?id|aws[ _-]?secret[ _-]?access[ _-]?key|accountkey|sharedaccesskey|sharedaccesssignature|sig|密码|密钥|令牌)`;
const credentialAssignment = new RegExp(
  String.raw`((?:^|[^\p{L}\p{N}_-])["']?${credentialFields}["']?[ \t]*[:=：][ \t]*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s"',;{}<>&，。；、]+)`,
  'gimu',
);
function placeholder(value) {
  const v = value.replace(/^["']|["']$/g, '');
  return /^(?:<[^>]+>|\[[A-Z_]+\]|\$\{[^}]+\}|process\.env\.[A-Z_][A-Z0-9_]*|changeme|placeholder|example|your[_-].*|test-token)$/i.test(v);
}
function redact(text) {
  return String(text)
    .replace(/-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?(?:-----END \1-----|$)/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(credentialAssignment, (_, prefix, value) => {
      if (/^(?:bearer|basic)$/i.test(value)) return prefix + value;
      const quote = /^["']/.test(value) ? value[0] : '';
      return `${prefix}${quote}[REDACTED]${quote}`;
    })
    .replace(/\b((?:bearer|basic)[ \t]+)[a-z0-9_./+~=-]+/gi, '$1[REDACTED]')
    .replace(/((?:密码|密钥|令牌)[ \t]*(?:是|为)[ \t]*)[^\s"',;{}<>&，。；、]+/gu, '$1[REDACTED]')
    .replace(/\b(?:gh[pousr]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|sk-(?:proj-)?[a-z0-9_-]{16,}|(?:AKIA|ASIA)[A-Z0-9]{16}|AIza[a-z0-9_-]{30,}|xox[baprs]-[a-z0-9-]{10,}|(?:sk|rk)_(?:live|test)_[a-z0-9_-]{12,}|npm_[a-z0-9]{20,}|glpat-[a-z0-9_-]{16,})\b/gi, '[REDACTED_TOKEN]')
    .replace(/\beyJ[a-z0-9_-]{5,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/gi, '[REDACTED_TOKEN]')
    .replace(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/(?<![\w+])(?:\+?86[ -]?)?1[3-9]\d{9}(?!\w)/g, '[REDACTED_PHONE]');
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
  if (!['open', 'standard', 'strict', 'locked'].includes(s.level) || typeof s.blockPromptSecrets !== 'boolean' || (s.blockThreats !== undefined && typeof s.blockThreats !== 'boolean')) throw new Error('Invalid settings');
  return { ...s, blockThreats: s.blockThreats ?? true };
}
function threats(prompt) {
  return [
    ['data-exfiltration', /send\s+(?:all|every|entire)\s+.+?\s+to\s+|export\s+.*\s+to\s+(?:external|outside|third[ _-]?party)|upload\s+.*(?:credentials|secrets|keys)|curl\s+.*(?:\s-d\s|--data\b)|(?:上传|发送|导出).{0,40}(?:外部|第三方|公网|密钥|凭证)/iu],
    ['privilege-escalation', /\b(?:sudo|runas\s+\/user|chmod\s+(?:-\w+\s+)*777)\b|as\s+root|admin\s+access|add\s+.*(?:sudoers|administrators)|(?:提升|授予|添加).{0,15}(?:管理员|root|超级用户)权限/iu],
    ['destructive-command', /\brm\s+(?:-[a-z]+\s+)*(?:--recursive\b|-[a-z]*r[a-z]*\b)|\bdel\s+\/[sq]\b|\bformat\s+[a-z]:|\bRemove-Item\b[^\n]*-Recurse\b|\bgit\s+(?:reset\s+--hard|clean\s+-[a-z]*f)|wipe\s+(?:all|entire|every)|(?:删除|清空|销毁).{0,15}(?:所有|全部|整个|目录|数据库|生产数据)/iu],
    ['database-destruction', /\b(?:drop\s+(?:database|table|schema)|truncate\s+table|delete\s+from)\b/iu],
    ['instruction-override', /ignore\s+(?:previous|above|all)\s+(?:instructions?|rules?|prompts?)|you\s+are\s+now\s+(?:a|an)\s+(?:assistant|ai|bot|system|expert|language\s+model)\b|^\s*system\s*:\s*you\s+are|(?:忽略|无视|绕过).{0,15}(?:指令|规则|限制|安全策略)/imu],
  ].filter(([, re]) => re.test(prompt)).map(([rule]) => rule);
}
function audit(repo, event, details = {}) {
  // Use a stable pseudonymous session ID; never log the prompt or raw runtime ID.
  const session = crypto.createHash('sha256').update(event.session_id).digest('hex');
  const dir = path.join(repo, 'logs/codex/governance');
  fs.mkdirSync(dir, { recursive: true });
  const record = { schema_version: 2, policy_version: '0.2.2', event_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(), session_id: session,
    turn_id: event.turn_id ? redact(event.turn_id) : null, event: event.hook_event_name, ...details };
  fs.appendFileSync(path.join(dir, `${session}.jsonl`), JSON.stringify(record) + '\n', { mode: 0o600 });
}
module.exports = { git, root, inspect, redact, scan, settings, threats, audit };
