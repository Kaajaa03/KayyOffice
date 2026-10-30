import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appLog, initDiag, APP_LOG_MAX_BYTES } from '../src/main/diag';

let dir = '';
const logFile = () => join(dir, 'app.log');
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'kayy-diag-')); initDiag(dir); });

describe('appLog', () => {
  it('appends single lines with level, message and the error message only', () => {
    appLog('warn', 'settings: failed', Object.assign(new Error('EPERM: denied'), { stack: 'at secret.js:1', cmd: 'rm -rf /' }));
    appLog('info', 'started');
    const lines = readFileSync(logFile(), 'utf8').trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z WARN settings: failed \| EPERM: denied$/);
    expect(lines[1]).toMatch(/ INFO started$/);
    expect(readFileSync(logFile(), 'utf8')).not.toMatch(/secret\.js|rm -rf/);
  });
  it('keeps every entry on one line and truncates long text', () => {
    appLog('error', 'a\nb\r\nc', new Error('x'.repeat(5000) + '\nsecond'));
    const text = readFileSync(logFile(), 'utf8');
    expect(text.trimEnd().split('\n')).toHaveLength(1);
    expect(text.length).toBeLessThan(900);
  });
  it('redacts long hex strings such as tokens', () => {
    const token = 'ab12'.repeat(16);
    appLog('error', 'auth failed', new Error(`bad token ${token}`));
    const text = readFileSync(logFile(), 'utf8');
    expect(text).not.toContain(token);
    expect(text).toContain('[redacted]');
  });
  it('accepts non-Error values', () => {
    appLog('error', 'weird', 'just a string');
    appLog('error', 'weird2', { not: 'an error' });
    expect(readFileSync(logFile(), 'utf8')).toContain('just a string');
  });
  it('rotates at the size limit and keeps exactly one old file', () => {
    writeFileSync(logFile(), 'old line\n'.repeat(Math.ceil(APP_LOG_MAX_BYTES / 9) + 1));
    appLog('info', 'fresh');
    expect(readFileSync(join(dir, 'app.log.1'), 'utf8')).toMatch(/^old line/);
    const now = readFileSync(logFile(), 'utf8');
    expect(now).toMatch(/INFO fresh\n$/);
    expect(now).not.toContain('old line');
    writeFileSync(logFile(), 'x'.repeat(APP_LOG_MAX_BYTES + 1));
    appLog('info', 'again');
    expect(readFileSync(join(dir, 'app.log.1'), 'utf8')).toMatch(/^x+$/);
    expect(existsSync(join(dir, 'app.log.2'))).toBe(false);
  });
  it('never throws, even when the target is unusable', () => {
    initDiag(join(dir, 'missing', 'deeper'));
    expect(() => appLog('error', 'no dir', new Error('x'))).not.toThrow();
    const blocked = join(dir, 'blocked');
    mkdirSync(join(blocked, 'app.log'), { recursive: true }); // app.log is a directory
    initDiag(blocked);
    expect(() => appLog('error', 'dir in the way')).not.toThrow();
    expect(() => appLog('error', 'circular', { get message(): string { throw new Error('getter'); } })).not.toThrow();
  });
});
