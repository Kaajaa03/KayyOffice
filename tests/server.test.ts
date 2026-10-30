import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/main/server';
import { loadConfig, updateConfig } from '../src/main/config';
import { requestAuth, responseProof } from '../src/main/auth';
import type { AgentEvent } from '../src/shared/types';

const good: AgentEvent = { ts: 1, sessionId: 's', agentId: 's', event: 'PreToolUse', cwd: 'C:\\x', tool: 'Bash' };
const TOKEN = 'tok'.repeat(22);
const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()!(); });

async function start(port = 48100, onEvent: (e: AgentEvent) => void = () => {}) {
  const s = await startServer({ token: TOKEN, port, onEvent });
  closers.push(s.close);
  return s;
}

interface SignOpts { token?: string; nonce?: string; path?: string; signedBody?: string; extra?: Record<string, string> }
/** Signed POST like the hook/mod do it (no token on the wire). */
function signedPost(port: number, path: string, body: string, o: SignOpts = {}) {
  const nonce = o.nonce ?? randomBytes(16).toString('hex');
  const auth = requestAuth(o.token ?? TOKEN, nonce, o.path ?? path, o.signedBody ?? body);
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST', headers: { 'x-kayy-nonce': nonce, 'x-kayy-auth': auth, ...o.extra }, body,
  });
}
const post = (port: number, body: string, o?: SignOpts) => signedPost(port, '/event', body, o);

describe('config', () => {
  it('creates config with random token and default port, then reuses it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kayy-'));
    const c1 = loadConfig(dir);
    expect(c1.token).toMatch(/^[0-9a-f]{64}$/);
    expect(c1.port).toBe(47821);
    expect(loadConfig(dir).token).toBe(c1.token);
    updateConfig(dir, { port: 47830 });
    expect(JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')).port).toBe(47830);
  });
});

describe('updateConfig', () => {
  it('merges a patch, keeps token and port, persists welcomeShown', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kayy-'));
    const c1 = loadConfig(dir);
    updateConfig(dir, { welcomeShown: true });
    expect(loadConfig(dir)).toMatchObject({ token: c1.token, port: c1.port, welcomeShown: true });
  });
});

describe('server auth', () => {
  it('accepts a correctly signed event with 204 and calls onEvent once', async () => {
    const got: AgentEvent[] = [];
    const s = await start(48100, (e) => got.push(e));
    expect((await post(s.port, JSON.stringify(good))).status).toBe(204);
    expect(got).toEqual([good]);
  });
  it('no longer accepts the plain token header', async () => {
    const s = await start();
    const res = await fetch(`http://127.0.0.1:${s.port}/event`, { method: 'POST', headers: { 'x-kayy-token': TOKEN }, body: JSON.stringify(good) });
    expect(res.status).toBe(401);
  });
  it.each([
    ['wrong key', { token: 'x'.repeat(66) }],
    ['tampered body', { signedBody: '{"other":true}' }],
    ['signature for another path', { path: '/permission' }],
    ['too short nonce', { nonce: 'abc' }],
  ] as Array<[string, SignOpts]>)('rejects %s with 401 and no onEvent', async (_n, o) => {
    const got: AgentEvent[] = [];
    const s = await start(48100, (e) => got.push(e));
    expect((await post(s.port, JSON.stringify(good), o)).status).toBe(401);
    expect(got).toHaveLength(0);
  });
  it('rejects a replayed nonce', async () => {
    const s = await start();
    const nonce = randomBytes(16).toString('hex');
    expect((await post(s.port, JSON.stringify(good), { nonce })).status).toBe(204);
    expect((await post(s.port, JSON.stringify(good), { nonce })).status).toBe(401);
  });
  it('rejects oversized body with 413', async () => {
    const got: AgentEvent[] = [];
    const s = await start(48100, (e) => got.push(e));
    const res = await post(s.port, JSON.stringify({ ...good, message: 'x'.repeat(70_000) })).catch(() => null);
    if (res) expect(res.status).toBe(413);
    expect(got).toHaveLength(0);
  });
  it('rejects broken but correctly signed JSON with 400', async () => {
    const s = await start();
    expect((await post(s.port, '{nope')).status).toBe(400);
  });
  it('falls back to next port when busy', async () => {
    const a = await start(48110);
    const b = await start(48110);
    expect(b.port).toBe(a.port + 1);
  });
  it('binds only to 127.0.0.1', async () => {
    const s = await start();
    expect(s.address).toBe('127.0.0.1');
  });
});

describe('server /permission', () => {
  const body = JSON.stringify({ sessionId: 's', agentId: 's', tool: 'Bash', summary: '' });

  it('answers with a proof that binds the nonce and the decision', async () => {
    const s = await startServer({ token: TOKEN, port: 48120, onEvent: () => {}, onPermission: async () => 'allow' });
    closers.push(s.close);
    const nonce = randomBytes(16).toString('hex');
    const res = await signedPost(s.port, '/permission', body, { nonce });
    expect(await res.json()).toEqual({ decision: 'allow' });
    expect(res.headers.get('x-kayy-proof')).toBe(responseProof(TOKEN, nonce, 'allow'));
    expect(res.headers.get('x-kayy-proof')).not.toBe(responseProof(TOKEN, nonce, 'deny'));
  });
  it('rejects an unsigned permission request without asking anyone', async () => {
    let asked = false;
    const s = await startServer({ token: TOKEN, port: 48125, onEvent: () => {}, onPermission: async () => { asked = true; return 'allow'; } });
    closers.push(s.close);
    const res = await fetch(`http://127.0.0.1:${s.port}/permission`, { method: 'POST', headers: { 'x-kayy-token': TOKEN }, body });
    expect(res.status).toBe(401);
    expect(asked).toBe(false);
  });
  it('passes the permission source (mod) through and drops unknown sources', async () => {
    const seen: unknown[] = [];
    const s = await startServer({ token: TOKEN, port: 48128, onEvent: () => {}, onPermission: async (p) => { seen.push(p.source); return 'ask'; } });
    closers.push(s.close);
    const send = (source: string) => signedPost(s.port, '/permission', JSON.stringify({ sessionId: 's', agentId: 's', tool: 'Bash', summary: '', source }));
    await send('mod');
    await send('weird');
    expect(seen).toEqual(['mod', undefined]);
  });
});

describe('server Host check (DNS rebinding)', () => {
  /** Raw request so the Host header can be chosen freely. */
  function rawPost(port: number, host: string | undefined, body: string, endBody = true): Promise<number> {
    return new Promise((resolve, reject) => {
      const nonce = randomBytes(16).toString('hex');
      const headers: Record<string, string | number> = {
        'x-kayy-nonce': nonce, 'x-kayy-auth': requestAuth(TOKEN, nonce, '/event', body), 'content-length': Buffer.byteLength(body),
      };
      if (host !== undefined) headers.host = host;
      const req = http.request({ host: '127.0.0.1', port, path: '/event', method: 'POST', headers }, (res) => { res.resume(); resolve(res.statusCode!); req.destroy(); });
      req.on('error', reject);
      if (endBody) req.end(body); else req.write(body.slice(0, 1)); // never finishes the body
    });
  }
  const body = JSON.stringify(good);

  it.each([['127.0.0.1'], ['localhost']])('accepts Host %s:<port>', async (name) => {
    const got: AgentEvent[] = [];
    const s = await start(48101, (e) => got.push(e));
    expect(await rawPost(s.port, `${name}:${s.port}`, body)).toBe(204);
    expect(got).toHaveLength(1);
  });
  it.each([
    ['a foreign name', 'evil.example:PORT'],
    ['a rebound name with the right port', 'localhost.evil.example:PORT'],
    ['the right name, wrong port', '127.0.0.1:1'],
    ['no port', '127.0.0.1'],
    ['a prefix trick', '127.0.0.1:PORTX'],
    ['a different loopback literal', '[::1]:PORT'],
  ])('answers 421 and no onEvent for %s', async (_n, host) => {
    const got: AgentEvent[] = [];
    const s = await start(48102, (e) => got.push(e));
    expect(await rawPost(s.port, host.replace('PORT', String(s.port)), body)).toBe(421);
    expect(got).toHaveLength(0);
  });
  it('answers 421 before the body has arrived', async () => {
    const s = await start(48103);
    expect(await rawPost(s.port, 'evil.example', body, false)).toBe(421);
  });
  it('checks against the real port after a port fallback', async () => {
    const blocker = http.createServer();
    await new Promise<void>((r) => blocker.listen(48104, '127.0.0.1', r));
    closers.push(() => new Promise<void>((r) => { blocker.close(() => r()); blocker.closeAllConnections(); }));
    const s = await start(48104);
    expect(s.port).not.toBe(48104);
    expect(await rawPost(s.port, '127.0.0.1:48104', body)).toBe(421);
    expect(await rawPost(s.port, `127.0.0.1:${s.port}`, body)).toBe(204);
  });
});
