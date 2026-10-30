#!/usr/bin/env node
// Kayy Office hook: forwards a Claude Code hook event to the local app.
// Dependency-free, always exits 0, silent on stdout (so it never affects Claude Code).
'use strict';
const crypto = require('node:crypto');
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
  const failed = h.hook_event_name === 'PostToolUseFailure' || (h.hook_event_name === 'PostToolUse' && resp && (resp.is_error === true || resp.error));
  if (failed) {
    message = 'ERROR: ' + (cut(h.tool_name, 100) || 'tool') + ' failed'; // never the tool output: it may hold secrets
  }
  return {
    ts: Date.now(),
    sessionId: cut(h.session_id, 200),
    agentId: sub || cut(h.session_id, 200),
    ...(sub ? { parentId: cut(h.session_id, 200) } : {}),
    event: h.hook_event_name === 'PostToolUseFailure' ? 'PostToolUse' : h.hook_event_name,
    agentType: cut(h.agent_type, 100),
    tool: cut(h.tool_name, 100),
    file: h.tool_input && typeof h.tool_input === 'object' ? cut(h.tool_input.file_path || h.tool_input.notebook_path, 200) : undefined,
    cwd: cut(h.cwd || '', 500),
    message,
  };
}

// The token never goes over the wire (a process squatting on the port must not learn it):
// requests are signed, see src/main/auth.ts for the exact scheme.
function hmac(token, msg) {
  return crypto.createHmac('sha256', token).update(msg).digest('hex');
}

function signed(cfg, route, body) {
  const nonce = crypto.randomBytes(16).toString('hex');
  return {
    nonce,
    headers: {
      'x-kayy-nonce': nonce,
      'x-kayy-auth': hmac(cfg.token, 'req|' + nonce + '|' + route + '|' + body),
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    },
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
      headers: signed(cfg, '/event', body).headers,
      timeout: TIMEOUT_MS,
    },
    (res) => { res.resume(); res.on('end', done); res.on('error', done); },
  );
  req.on('timeout', () => { req.destroy(); done(); });
  req.on('error', done);
  req.end(body);
}

// --- blocking permission mode (PermissionRequest hook) -------------------
const PERMISSION_WAIT_MS = 22000;

function summarize(input) {
  if (!input || typeof input !== 'object') return '';
  if (typeof input.command === 'string') return input.command.slice(0, 300);
  if (typeof input.file_path === 'string') return input.file_path.slice(0, 300);
  try { return JSON.stringify(input).slice(0, 300); } catch { return ''; }
}

// Interactive tools: their "permission" is a real user dialog (plan approval, a question) that an
// Allow click on the overlay must never answer.
const NEVER_ASK = new Set(['ExitPlanMode', 'AskUserQuestion']);

// The proof binds nonce AND decision, so only a server that knows the token can produce it.
function proofOk(header, nonce, token, decision) {
  const expected = Buffer.from(hmac(token, 'res|' + nonce + '|' + decision), 'utf8');
  const got = Buffer.from(String(header || ''), 'utf8');
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

function askPermission(h, cfg) {
  if (NEVER_ASK.has(h.tool_name)) return done();
  const sub = typeof h.agent_id === 'string' && h.agent_id ? h.agent_id : null;
  const body = JSON.stringify({
    sessionId: cut(h.session_id, 200),
    agentId: sub || cut(h.session_id, 200),
    tool: cut(h.tool_name, 100),
    summary: summarize(h.tool_input),
  });
  const { nonce, headers } = signed(cfg, '/permission', body);
  const req = http.request(
    {
      host: '127.0.0.1', port: cfg.port, path: '/permission', method: 'POST',
      headers,
      timeout: PERMISSION_WAIT_MS,
    },
    (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { if (data.length < 4096) data += c; });
      res.on('end', () => {
        try {
          const { decision } = JSON.parse(data);
          if ((decision === 'allow' || decision === 'deny') && proofOk(res.headers['x-kayy-proof'], nonce, cfg.token, decision)) {
            process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: decision } } }));
          }
        } catch { /* no decision / bad proof -> normal prompt */ }
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
