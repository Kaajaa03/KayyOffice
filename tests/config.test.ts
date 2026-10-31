import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/main/config';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'kayy-config-')); });

const TOKEN = 'a'.repeat(32);

describe('loadConfig', () => {
  it('keeps a valid port', () => {
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ token: TOKEN, port: 50000 }));
    expect(loadConfig(dir).port).toBe(50000);
  });

  it.each([0, -1, 1.5, 80, 99999, '47821'])('falls back to the default for port %j', (port) => {
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ token: TOKEN, port }));
    expect(loadConfig(dir).port).toBe(47821);
  });

  it('backs up an unreadable config before generating a new one', () => {
    writeFileSync(join(dir, 'config.json'), '{ broken json');
    loadConfig(dir);
    expect(readFileSync(join(dir, 'config.json.bak'), 'utf8')).toBe('{ broken json');
    expect(existsSync(join(dir, 'config.json'))).toBe(true);
  });
});
