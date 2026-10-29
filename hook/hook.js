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
    agentType: cut(h.agent_type, 100),
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

// --- blocking permission mode (PermissionRequest hook) -------------------
const PERMISSION_WAIT_MS = 26000;

function summarize(input) {
  if (!input || typeof input !== 'object') return '';
  if (typeof input.command === 'string') return input.command.slice(0, 300);
  if (typeof input.file_path === 'string') return input.file_path.slice(0, 300);
  try { return JSON.stringify(input).slice(0, 300); } catch { return ''; }
}

function askPermission(h, cfg) {
  const sub = typeof h.agent_id === 'string' && h.agent_id ? h.agent_id : null;
  const body = JSON.stringify({
    sessionId: cut(h.session_id, 200),
    agentId: sub || cut(h.session_id, 200),
    tool: cut(h.tool_name, 100),
    summary: summarize(h.tool_input),
  });
  const req = http.request(
    {
      host: '127.0.0.1', port: cfg.port, path: '/permission', method: 'POST',
      headers: { 'x-kayy-token': cfg.token, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      timeout: PERMISSION_WAIT_MS,
    },
    (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { if (data.length < 4096) data += c; });
      res.on('end', () => {
        try {
          const { decision } = JSON.parse(data);
          if (decision === 'allow' || decision === 'deny') {
            process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: decision } } }));
          }
        } catch { /* no decision -> normal prompt */ }
        done();
      });
      res.on('error', done);
    },
  );
  req.on('timeout', () => { req.destroy(); done(); });
  req.on('error', done);
  req.end(body);
}

const permissionMode = process.argv.includes('--permission');

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
    if (permissionMode) {
      const h = JSON.parse(input);
      if (!h || !h.session_id || !h.tool_name) return done();
      return askPermission(h, JSON.parse(fs.readFileSync(path.join(configDir(), 'config.json'), 'utf8')));
    }
    const event = toEvent(JSON.parse(input));
    if (!event) return done();
    const cfg = JSON.parse(fs.readFileSync(path.join(configDir(), 'config.json'), 'utf8'));
    send(event, cfg);
  } catch {
    done();
  }
});
