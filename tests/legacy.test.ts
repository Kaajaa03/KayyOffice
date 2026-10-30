import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeLegacyHooks } from '../src/main/legacy';

const BOM = String.fromCharCode(0xfeff);
const dirs = () => ({ claude: mkdtempSync(join(tmpdir(), 'kayy-claude-')), config: mkdtempSync(join(tmpdir(), 'kayy-cfg-')) });
const ours = (extra = '') => ({ hooks: [{ type: 'command', command: `node "C:/x/hook.js" --kayy-office${extra}`, async: true }] });
const foreign = { hooks: [{ type: 'command', command: 'echo hi' }] };
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const backups = (dir: string) => readdirSync(dir).filter((n) => n.startsWith('settings.json.kayy-backup-'));
const legacy = {
  theme: 'dark',
  hooks: {
    Stop: [foreign, ours()],
    PreToolUse: [{ matcher: '*', ...ours() }],
    PostToolUseFailure: [{ matcher: '*', ...ours() }],
    PermissionRequest: [{ matcher: '*', ...ours(' --permission') }],
  },
};

describe('removeLegacyHooks', () => {
  it('removes only our entries (all events, PermissionRequest included) and keeps foreign hooks and settings', () => {
    const { claude, config } = dirs();
    const p = join(claude, 'settings.json');
    writeFileSync(p, JSON.stringify(legacy));
    expect(removeLegacyHooks(claude, config)).toBe(true);
    const s = read(p);
    expect(s.theme).toBe('dark');
    expect(s.hooks).toEqual({ Stop: [foreign] });
  });
  it('writes a backup of the previous file and no temp files', () => {
    const { claude, config } = dirs();
    const p = join(claude, 'settings.json');
    writeFileSync(p, JSON.stringify(legacy));
    removeLegacyHooks(claude, config);
    const b = backups(claude);
    expect(b).toHaveLength(1);
    expect(read(join(claude, b[0])).hooks.PreToolUse).toBeDefined();
    expect(readdirSync(claude).filter((n) => n.includes('.tmp'))).toEqual([]);
  });
  it('drops an empty hooks object', () => {
    const { claude, config } = dirs();
    const p = join(claude, 'settings.json');
    writeFileSync(p, JSON.stringify({ theme: 'dark', hooks: { Stop: [ours()] } }));
    removeLegacyHooks(claude, config);
    expect(read(p)).toEqual({ theme: 'dark' });
  });
  it('keeps 5 backups: the very first plus the newest', () => {
    const { claude, config } = dirs();
    const p = join(claude, 'settings.json');
    writeFileSync(p, JSON.stringify(legacy));
    for (let i = 1; i <= 7; i++) writeFileSync(`${p}.kayy-backup-${i}`, '{}');
    writeFileSync(join(claude, 'other.json.kayy-backup-1'), '{}');
    removeLegacyHooks(claude, config);
    const b = backups(claude);
    expect(b).toHaveLength(5);
    expect(b).toContain('settings.json.kayy-backup-1');
    expect(b).not.toContain('settings.json.kayy-backup-2');
    expect(b).toContain('settings.json.kayy-backup-7');
    expect(existsSync(join(claude, 'other.json.kayy-backup-1'))).toBe(true);
  });
  it('never overwrites invalid JSON', () => {
    const { claude, config } = dirs();
    const p = join(claude, 'settings.json');
    writeFileSync(p, '{ broken --kayy-office');
    expect(removeLegacyHooks(claude, config)).toBe(false);
    expect(readFileSync(p, 'utf8')).toBe('{ broken --kayy-office');
    expect(backups(claude)).toEqual([]);
  });
  it('nothing to do: no write and no backup (also missing, empty, BOM-only-foreign files)', () => {
    const { claude, config } = dirs();
    const p = join(claude, 'settings.json');
    expect(removeLegacyHooks(claude, config)).toBe(false); // no file
    expect(existsSync(p)).toBe(false);
    for (const text of ['', ' \r\n', BOM + JSON.stringify({ hooks: { Stop: [foreign] } }), '[]', JSON.stringify({ hooks: { Stop: 'x' } })]) {
      writeFileSync(p, text);
      expect(removeLegacyHooks(claude, config)).toBe(false);
      expect(readFileSync(p, 'utf8')).toBe(text);
    }
    expect(backups(claude)).toEqual([]);
  });
  it('tolerates a BOM on a file that has our hooks', () => {
    const { claude, config } = dirs();
    const p = join(claude, 'settings.json');
    writeFileSync(p, BOM + JSON.stringify(legacy));
    expect(removeLegacyHooks(claude, config)).toBe(true);
    expect(read(p).hooks).toEqual({ Stop: [foreign] });
  });
  it('deletes the staged hook.js from the config dir, even without a settings file', () => {
    const { claude, config } = dirs();
    writeFileSync(join(config, 'hook.js'), '// old');
    removeLegacyHooks(claude, config);
    expect(existsSync(join(config, 'hook.js'))).toBe(false);
  });
});
