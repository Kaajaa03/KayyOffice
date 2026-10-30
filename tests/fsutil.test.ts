import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fail = vi.hoisted(() => ({ code: null as string | null }));
vi.mock('node:fs', async (orig) => {
  const real = await orig<typeof import('node:fs')>();
  return {
    ...real,
    renameSync: (a: string, b: string) => {
      if (fail.code) throw Object.assign(new Error('boom'), { code: fail.code });
      return real.renameSync(a, b);
    },
  };
});

import { writeFileAtomic } from '../src/main/fsutil';

const tmp = () => mkdtempSync(join(tmpdir(), 'kayy-fs-'));
afterEach(() => { fail.code = null; });

describe('writeFileAtomic', () => {
  it('writes a new file and replaces an existing one without leftovers', () => {
    const dir = tmp();
    const p = join(dir, 'a.json');
    writeFileAtomic(p, 'one');
    writeFileAtomic(p, 'two');
    expect(readFileSync(p, 'utf8')).toBe('two');
    expect(readdirSync(dir)).toEqual(['a.json']);
  });
  it.each(['EPERM', 'EBUSY'])('falls back to copy+unlink when rename fails with %s', (code) => {
    const dir = tmp();
    const p = join(dir, 'a.json');
    writeFileSync(p, 'old');
    fail.code = code;
    writeFileAtomic(p, 'new');
    expect(readFileSync(p, 'utf8')).toBe('new');
    expect(readdirSync(dir)).toEqual(['a.json']);
  });
  it('rethrows other rename errors and keeps the old file and no temp file', () => {
    const dir = tmp();
    const p = join(dir, 'a.json');
    writeFileSync(p, 'old');
    fail.code = 'ENOSPC';
    expect(() => writeFileAtomic(p, 'new')).toThrow('boom');
    expect(readFileSync(p, 'utf8')).toBe('old');
    expect(readdirSync(dir)).toEqual(['a.json']);
  });
});
