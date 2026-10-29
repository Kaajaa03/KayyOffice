import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startServer } from '../src/main/server';
import type { ServerOptions } from '../src/main/server';
import { loadConfig, saveConfigPort } from '../src/main/config';
import type { AgentEvent } from '../src/shared/types';

const HOOK = resolve(__dirname, '../hook/hook.js');
const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()!(); });

function runHook(dir: string, stdin: string, args: string[] = []): Promise<{ code: number | null; ms: number; out: string }> {
  return new Promise((res) => {
    const t0 = Date.now();
    const p = spawn('node', [HOOK, ...args], { env: { ...process.env, KAYY_CONFIG_DIR: dir } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('close', (code) => res({ code, ms: Date.now() - t0, out }));
    p.stdin.end(stdin);
  });
}

async function setup(port: number, onPermission?: ServerOptions['onPermission']) {
  const dir = mkdtempSync(join(tmpdir(), 'kayy-hook-'));
  const cfg = loadConfig(dir);
  const got: AgentEvent[] = [];
  const s = await startServer({ token: cfg.token, port, onEvent: (e) => got.push(e), onPermission });
  closers.push(s.close);
  saveConfigPort(dir, s.port);
  return { dir, got };
}

describe('hook.js', () => {
  it('forwards a PreToolUse event', async () => {
    const { dir, got } = await setup(48120);
    const r = await runHook(dir, JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', cwd: 'C:\\p' }));
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ event: 'PreToolUse', sessionId: 's1', agentId: 's1', tool: 'Bash', cwd: 'C:\\p' });
  });
  it('maps agent_id to a child agent', async () => {
    const { dir, got } = await setup(48130);
    await runHook(dir, JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 's1', agent_id: 'sub9', tool_name: 'Read', cwd: 'C:\\p' }));
    expect(got[0]).toMatchObject({ agentId: 'sub9', parentId: 's1' });
  });
  it.each([['empty', ''], ['not json', 'garbage'], ['100KB garbage', 'x'.repeat(100_000)]])(
    'ignores %s stdin with exit 0 and no event', async (_n, input) => {
      const { dir, got } = await setup(48140);
      const r = await runHook(dir, input);
      expect(r.code).toBe(0);
      expect(got).toHaveLength(0);
    });
  const permInput = JSON.stringify({ hook_event_name: 'PermissionRequest', session_id: 's1', cwd: 'C:\\p', tool_name: 'Bash', tool_input: { command: 'rm -rf build' } });

  it('--permission prints an allow decision when the app allows', async () => {
    let seen: unknown;
    const { dir } = await setup(48150, async (p) => { seen = p; return 'allow'; });
    const r = await runHook(dir, permInput, ['--permission']);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });
    expect(seen).toMatchObject({ sessionId: 's1', tool: 'Bash', summary: 'rm -rf build' });
  });
  it('--permission prints a deny decision when the app denies', async () => {
    const { dir } = await setup(48160, async () => 'deny');
    const r = await runHook(dir, permInput, ['--permission']);
    expect(JSON.parse(r.out).hookSpecificOutput.decision.behavior).toBe('deny');
  });
  it("--permission prints nothing for 'ask' (normal prompt)", async () => {
    const { dir } = await setup(48170, async () => 'ask');
    const r = await runHook(dir, permInput, ['--permission']);
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
  });
  it('--permission prints nothing and exits 0 when the app is not running', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kayy-hook-'));
    loadConfig(dir);
    saveConfigPort(dir, 48198);
    const r = await runHook(dir, permInput, ['--permission']);
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
    expect(r.ms).toBeLessThan(1500);
  });
  it('--permission ignores a decision from an impostor server that cannot prove the token', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kayy-hook-'));
    loadConfig(dir);
    const fake = http.createServer((_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end('{"decision":"allow"}'));
    await new Promise<void>((r) => fake.listen(48180, '127.0.0.1', r));
    closers.push(() => new Promise<void>((r) => { fake.close(() => r()); fake.closeAllConnections(); }));
    saveConfigPort(dir, 48180);
    const r = await runHook(dir, permInput, ['--permission']);
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
  });
  it.each(['ExitPlanMode', 'AskUserQuestion'])('--permission never asks the overlay about interactive tool %s', async (tool) => {
    let called = false;
    const { dir } = await setup(48190, async () => { called = true; return 'allow'; });
    const input = JSON.stringify({ hook_event_name: 'PermissionRequest', session_id: 's1', cwd: 'C:\\p', tool_name: tool, tool_input: {} });
    const r = await runHook(dir, input, ['--permission']);
    expect(r.out).toBe('');
    expect(called).toBe(false);
  });
  it('exits 0 quickly when the app is not running', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kayy-hook-'));
    const cfg = loadConfig(dir);
    saveConfigPort(dir, 48199);
    void cfg;
    const r = await runHook(dir, JSON.stringify({ hook_event_name: 'Stop', session_id: 's', cwd: 'C:\\p' }));
    expect(r.code).toBe(0);
    expect(r.ms).toBeLessThan(1000);
  });
});
