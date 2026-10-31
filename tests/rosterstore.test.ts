import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadRoster, saveRoster } from '../src/main/rosterstore';

const dirs: string[] = [];
const file = () => { const d = mkdtempSync(join(tmpdir(), 'kayy-roster-')); dirs.push(d); return join(d, 'roster.json'); };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('rosterstore', () => {
  it('returns what was saved', () => {
    const f = file();
    saveRoster(f, [{ type: 'kayy-scout', model: 'haiku' }, { type: 'tester' }]);
    expect(loadRoster(f)).toEqual([{ type: 'kayy-scout', model: 'haiku' }, { type: 'tester' }]);
  });
  it('treats a missing or broken file as no roster', () => {
    const f = file();
    expect(loadRoster(f)).toBeUndefined();
    writeFileSync(f, '{nope');
    expect(loadRoster(f)).toBeUndefined();
  });
  it('drops malformed entries', () => {
    const f = file();
    writeFileSync(f, JSON.stringify([{ type: 'ok' }, 5, { model: 'x' }]));
    expect(loadRoster(f)).toEqual([{ type: 'ok' }]);
  });
});
