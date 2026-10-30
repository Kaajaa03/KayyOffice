import { describe, it, expect } from 'vitest';
import { parseFlags } from '../src/main/flags';

describe('parseFlags', () => {
  it('defaults when no flag is given (non-flag arguments are ignored)', () => {
    expect(parseFlags(['electron.exe', 'C:\app'])).toEqual({
      demo: false, demoCount: 0, perfSeconds: 20, noCard: false, settings: false,
      screenshot: undefined, perf: undefined, configDir: undefined, lang: undefined, scale: undefined, hour: undefined, overlayWidth: undefined,
    });
  });
  it('parses valid values', () => {
    const f = parseFlags(['x', '--demo', '--no-card', '--settings', '--screenshot=C:\t\a=b.png', '--perf=p.json', '--perf-seconds=5',
      '--config-dir=C:\tmp\cfg', '--lang=en', '--scale=1.33', '--hour=22', '--overlay-width=640']);
    expect(f).toMatchObject({
      demo: true, noCard: true, settings: true, screenshot: 'C:\t\a=b.png', perf: 'p.json', perfSeconds: 5,
      configDir: 'C:\tmp\cfg', lang: 'en', scale: 1.33, hour: 22, overlayWidth: 640,
    });
  });
  it('--demo-count implies demo and is a whole number >= 0', () => {
    expect(parseFlags(['--demo-count=12'])).toMatchObject({ demo: true, demoCount: 12 });
    expect(parseFlags(['--demo-count=3.9']).demoCount).toBe(3);
    expect(parseFlags(['--demo-count=-4'])).toMatchObject({ demo: false, demoCount: 0 });
    expect(parseFlags(['--demo-count=abc'])).toMatchObject({ demo: false, demoCount: 0 });
  });
  it('ignores invalid values', () => {
    const f = parseFlags(['--lang=fr', '--scale=big', '--hour=24', '--overlay-width=99', '--perf-seconds=0', '--screenshot=', '--config-dir']);
    expect(f).toMatchObject({ lang: undefined, scale: undefined, hour: undefined, overlayWidth: undefined, perfSeconds: 20, screenshot: undefined, configDir: undefined });
    expect(parseFlags(['--hour=x1']).hour).toBeUndefined();
    expect(parseFlags(['--overlay-width=12345']).overlayWidth).toBeUndefined();
  });
});
