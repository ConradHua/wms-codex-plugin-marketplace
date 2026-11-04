#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const { root, settings, inspect, threats, audit, scan } = require('./core.cjs');
try {
  const input = fs.readFileSync(0, 'utf8');
  if (input.length > 2 * 1024 * 1024) throw new Error('Oversize input');
  const event = JSON.parse(input);
  if (!event || typeof event.session_id !== 'string' || !event.session_id || typeof event.cwd !== 'string') throw new Error('Invalid event');
  const repo = root(event.cwd);
  const policy = settings(repo);
  let output = {};
  switch (event.hook_event_name) {
    case 'SessionStart':
    case 'SessionEnd':
      audit(repo, event, { source: event.source || null, reason: event.reason || null });
      break;
    case 'UserPromptSubmit': {
      if (typeof event.prompt !== 'string') throw new Error('Missing prompt');
      const secrets = [...new Set(inspect(event.prompt).map(f => f.rule))];
      const signals = threats(event.prompt);
      const blocked = policy.level !== 'open' && ((policy.blockPromptSecrets && secrets.length > 0) || (['strict', 'locked'].includes(policy.level) && signals.length > 0));
      audit(repo, event, { secret_rules: secrets, threat_rules: signals, blocked, level: policy.level });
      if (blocked) output = { decision: 'block', reason: '治理检查发现敏感内容或受限操作。请使用占位符并明确操作范围后重新提交。' };
      else if (secrets.length || signals.length) output = { systemMessage: '治理检查发现风险信号；请核对任务范围与凭据使用。' };
      break;
    }
    case 'Stop': {
      const result = scan(repo, 'diff');
      audit(repo, event, { finding_count: result.findings.length, files_scanned: result.scanned });
      if (result.findings.length) output = { systemMessage: `治理扫描发现 ${result.findings.length} 项，请执行暂存区扫描并处理后提交。` };
      break;
    }
    default: throw new Error('Unsupported hook event');
  }
  process.stdout.write(JSON.stringify(output) + '\n');
} catch {
  // Parser and Git errors can contain input values. Keep diagnostics generic.
  process.stderr.write('Governance hook failed; check event schema, repository and policy settings.\n');
  process.exitCode = 2;
}
