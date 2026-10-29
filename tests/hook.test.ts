import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startServer } from '../src/main/server';
import { loadConfig, saveConfigPort } from '../src/main/config';
import type { AgentEvent } from '../src/shared/types';

const HOOK = resolve(__dirname, '../hook/hook.js');
const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()!(); });

function runHook(dir: string, stdin: string): Promise<{ code: number | null; ms: number; out: string }> {
  return new Promise((res) => {
    const t0 = Date.now();
    const p = spawn('node', [HOOK], { env: { ...process.env, KAYY_CONFIG_DIR: dir } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('close', (code) => res({ code, ms: Date.now() - t0, out }));
    p.stdin.end(stdin);
  });
}

async function setup(port: number) {
  const dir = mkdtempSync(join(tmpdir(), 'kayy-hook-'));
  const cfg = loadConfig(dir);
  const got: AgentEvent[] = [];
  const s = await startServer({ token: cfg.token, port, onEvent: (e) => got.push(e) });
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
