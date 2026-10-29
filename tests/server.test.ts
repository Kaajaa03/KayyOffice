import { describe, it, expect, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/main/server';
import { loadConfig, saveConfigPort } from '../src/main/config';
import type { AgentEvent } from '../src/shared/types';

const good: AgentEvent = { ts: 1, sessionId: 's', agentId: 's', event: 'PreToolUse', cwd: 'C:\\x', tool: 'Bash' };
const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()!(); });

async function start(port = 48100, onEvent: (e: AgentEvent) => void = () => {}) {
  const s = await startServer({ token: 'tok', port, onEvent });
  closers.push(s.close);
  return s;
}
const post = (port: number, body: string, token = 'tok') =>
  fetch(`http://127.0.0.1:${port}/event`, { method: 'POST', headers: { 'x-kayy-token': token }, body });

describe('config', () => {
  it('creates config with random token and default port, then reuses it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kayy-'));
    const c1 = loadConfig(dir);
    expect(c1.token).toMatch(/^[0-9a-f]{64}$/);
    expect(c1.port).toBe(47821);
    expect(loadConfig(dir).token).toBe(c1.token);
    saveConfigPort(dir, 47830);
    expect(JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')).port).toBe(47830);
  });
});

describe('server', () => {
  it('rejects wrong token with 401', async () => {
    const s = await start();
    expect((await post(s.port, JSON.stringify(good), 'bad')).status).toBe(401);
  });
  it('accepts valid event with 204 and calls onEvent once', async () => {
    const got: AgentEvent[] = [];
    const s = await start(48100, (e) => got.push(e));
    expect((await post(s.port, JSON.stringify(good))).status).toBe(204);
    expect(got).toEqual([good]);
  });
  it('rejects oversized body with 413', async () => {
    const got: AgentEvent[] = [];
    const s = await start(48100, (e) => got.push(e));
    const res = await post(s.port, JSON.stringify({ ...good, message: 'x'.repeat(70_000) })).catch(() => null);
    if (res) expect(res.status).toBe(413);
    expect(got).toHaveLength(0);
  });
  it('rejects broken JSON with 400', async () => {
    const s = await start();
    expect((await post(s.port, '{nope')).status).toBe(400);
  });
  it('falls back to next port when busy', async () => {
    const a = await start(48110);
    const b = await start(48110);
    expect(b.port).toBe(a.port + 1);
  });
  it('proves it knows the token on /permission replies (HMAC of the nonce)', async () => {
    const s = await startServer({ token: 'tok', port: 48120, onEvent: () => {}, onPermission: async () => 'allow' });
    closers.push(s.close);
    const res = await fetch(`http://127.0.0.1:${s.port}/permission`, {
      method: 'POST',
      headers: { 'x-kayy-token': 'tok', 'x-kayy-nonce': 'abc123' },
      body: JSON.stringify({ sessionId: 's', agentId: 's', tool: 'Bash', summary: '' }),
    });
    expect(await res.json()).toEqual({ decision: 'allow' });
    expect(res.headers.get('x-kayy-proof')).toBe(createHmac('sha256', 'tok').update('abc123').digest('hex'));
  });
  it('binds only to 127.0.0.1', async () => {
    const s = await start();
    expect(s.address).toBe('127.0.0.1');
  });
});
