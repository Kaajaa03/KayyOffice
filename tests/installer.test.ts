import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installHooks, uninstallHooks, stageHook, MARKER } from '../src/main/installer';
import { EVENT_NAMES } from '../src/shared/types';

const tmp = () => mkdtempSync(join(tmpdir(), 'kayy-inst-'));
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const HOOK = 'C:\\Users\\Max Mustermann\\x\\hook.js';

describe('installHooks', () => {
  it('creates settings with all 8 events when file is missing', () => {
    const p = join(tmp(), 'settings.json');
    installHooks(p, HOOK);
    const s = read(p);
    for (const e of EVENT_NAMES) expect(s.hooks[e]).toBeDefined();
  });
  it('registers a blocking PermissionRequest hook with a 30 s timeout', () => {
    const p = join(tmp(), 'settings.json');
    installHooks(p, HOOK);
    const h = read(p).hooks.PermissionRequest[0].hooks[0];
    expect(h.command).toContain('--permission');
    expect(h.command).toContain(MARKER);
    expect(h.timeout).toBe(30);
  });
  it('keeps foreign hooks and other settings', () => {
    const p = join(tmp(), 'settings.json');
    const foreign = { hooks: [{ type: 'command', command: 'echo hi' }] };
    writeFileSync(p, JSON.stringify({ theme: 'dark', hooks: { Stop: [foreign] } }));
    installHooks(p, HOOK);
    const s = read(p);
    expect(s.theme).toBe('dark');
    expect(s.hooks.Stop).toContainEqual(foreign);
    expect(s.hooks.Stop).toHaveLength(2);
  });
  it('throws on invalid JSON and leaves the file untouched', () => {
    const p = join(tmp(), 'settings.json');
    writeFileSync(p, '{ broken');
    expect(() => installHooks(p, HOOK)).toThrow(/settings\.json/);
    expect(readFileSync(p, 'utf8')).toBe('{ broken');
  });
  it('writes a backup when the file existed', () => {
    const dir = tmp();
    const p = join(dir, 'settings.json');
    writeFileSync(p, '{}');
    const { backupPath } = installHooks(p, HOOK);
    expect(backupPath && existsSync(backupPath)).toBe(true);
    expect(readdirSync(dir).length).toBe(2);
  });
  it('is idempotent', () => {
    const p = join(tmp(), 'settings.json');
    installHooks(p, HOOK);
    installHooks(p, HOOK);
    expect(read(p).hooks.Stop).toHaveLength(1);
  });
  it('quotes the script path, even with spaces', () => {
    const p = join(tmp(), 'settings.json');
    installHooks(p, HOOK);
    const cmd = read(p).hooks.Stop[0].hooks[0].command as string;
    expect(cmd).toContain('"C:/Users/Max Mustermann/x/hook.js"');
    expect(cmd).toContain(MARKER);
  });
});

describe('stageHook', () => {
  it('copies hook.js to a stable per-user location and returns that path', () => {
    const src = join(tmp(), 'hook.js');
    writeFileSync(src, '// hook v1');
    const destDir = join(tmp(), 'KayyOffice');
    const dest = stageHook(src, destDir);
    expect(dest).toBe(join(destDir, 'hook.js'));
    expect(readFileSync(dest, 'utf8')).toBe('// hook v1');
    writeFileSync(src, '// hook v2');
    expect(readFileSync(stageHook(src, destDir), 'utf8')).toBe('// hook v2');
  });
});

describe('uninstallHooks', () => {
  it('removes only marked entries', () => {
    const p = join(tmp(), 'settings.json');
    const foreign = { hooks: [{ type: 'command', command: 'echo hi' }] };
    writeFileSync(p, JSON.stringify({ hooks: { Stop: [foreign] } }));
    installHooks(p, HOOK);
    uninstallHooks(p);
    const s = read(p);
    expect(s.hooks.Stop).toEqual([foreign]);
    expect(s.hooks.PreToolUse).toBeUndefined();
  });
});
