#!/usr/bin/env node
// Kayy Office hook: forwards a Claude Code hook event to the local app.
// Dependency-free, always exits 0, silent on stdout (so it never affects Claude Code).
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MAX_STDIN = 1024 * 1024;
const TIMEOUT_MS = 150;

const done = () => process.exit(0);
const cut = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);

function configDir() {
  return process.env.KAYY_CONFIG_DIR || path.join(process.env.APPDATA || '', 'KayyOffice');
}

function toEvent(h) {
  if (!h || typeof h !== 'object' || !h.hook_event_name || !h.session_id) return null;
  const sub = typeof h.agent_id === 'string' && h.agent_id ? h.agent_id : null;
  let message = cut(h.message, 500);
  const resp = h.tool_response;
  if (h.hook_event_name === 'PostToolUse' && resp && (resp.is_error === true || resp.error)) {
    message = 'ERROR: ' + (cut(typeof resp.error === 'string' ? resp.error : '', 400) || 'tool failed');
  }
  return {
    ts: Date.now(),
    sessionId: cut(h.session_id, 200),
    agentId: sub || cut(h.session_id, 200),
    ...(sub ? { parentId: cut(h.session_id, 200) } : {}),
    event: h.hook_event_name,
    tool: cut(h.tool_name, 100),
    cwd: cut(h.cwd || '', 500),
    message,
  };
}

function send(event, cfg) {
  const body = JSON.stringify(event);
  const req = http.request(
    {
      host: '127.0.0.1',
      port: cfg.port,
      path: '/event',
      method: 'POST',
      headers: { 'x-kayy-token': cfg.token, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      timeout: TIMEOUT_MS,
    },
    (res) => { res.resume(); res.on('end', done); res.on('error', done); },
  );
  req.on('timeout', () => { req.destroy(); done(); });
  req.on('error', done);
  req.end(body);
}

let input = '';
let tooBig = false;
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  if (tooBig) return;
  input += c;
  if (input.length > MAX_STDIN) { tooBig = true; input = ''; }
});
process.stdin.on('error', done);
process.stdin.on('end', () => {
  try {
    if (tooBig) return done();
    const event = toEvent(JSON.parse(input));
    if (!event) return done();
    const cfg = JSON.parse(fs.readFileSync(path.join(configDir(), 'config.json'), 'utf8'));
    send(event, cfg);
  } catch {
    done();
  }
});
