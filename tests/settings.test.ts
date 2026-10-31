import { describe, it, expect } from 'vitest';
import { SettingsModel, modConnected } from '../src/main/settings';
import type { SettingsDeps } from '../src/main/settings';

function make(over: Partial<SettingsDeps> = {}) {
  const log: string[] = [];
  const persisted: Array<Record<string, unknown>> = [];
  let autostart = false;
  const deps: SettingsDeps = {
    initial: { language: 'de', scale: 1, opacity: 1, placement: 'top-center', approvals: 'risky', awake: true, sound: false },
    version: '1.2.0',
    hotkey: 'Strg+Alt+O',
    autostartAvailable: true,
    getAutostart: () => autostart,
    setAutostart: (b) => { autostart = b; log.push(`autostart:${b}`); },
    applyLanguage: (l) => log.push(`lang:${l}`),
    applyScale: (s) => { log.push(`scale:${s}`); return s; },
    applyOpacity: (o) => log.push(`opacity:${o}`),
    applyPlacement: (p) => { log.push(`place:${p}`); return { x: 1, y: 2 }; },
    setAwake: (b) => log.push(`awake:${b}`),
    setSound: (b) => log.push(`sound:${b}`),
    setApprovals: (m) => log.push(`approvals:${m}`),
    persist: (patch) => persisted.push(patch),
    modActive: () => false,
    port: () => 47821,
    changed: () => log.push('changed'),
    ...over,
  };
  return { m: new SettingsModel(deps), log, persisted };
}

describe('SettingsModel.snapshot', () => {
  it('reports validated state and live status', () => {
    const { m } = make();
    expect(m.snapshot()).toEqual({
      language: 'de', scale: 1, opacity: 1, placement: 'top-center', approvals: 'risky', awake: true, sound: false,
      autostart: false, autostartAvailable: true, mod: false, port: 47821,
      version: '1.2.0', hotkey: 'Strg+Alt+O',
    });
  });
});

describe('modConnected', () => {
  it('is true only when an event arrived within the last 5 minutes', () => {
    const now = 10_000_000;
    expect(modConnected(0, now)).toBe(false); // never
    expect(modConnected(now - 1000, now)).toBe(true);
    expect(modConnected(now - 5 * 60_000, now)).toBe(true);
    expect(modConnected(now - 5 * 60_000 - 1, now)).toBe(false);
  });
});

describe('SettingsModel.set', () => {
  it('applies, persists and notifies', () => {
    const { m, log, persisted } = make();
    expect(m.set('language', 'en')).toEqual({ ok: true });
    expect(log).toEqual(['lang:en', 'changed']);
    expect(persisted).toEqual([{ language: 'en' }]);
    expect(m.snapshot().language).toBe('en');
  });
  it('scale: only the allowed steps; stores the effective (fitted) scale', () => {
    const { m, persisted } = make({ applyScale: () => 1.33 });
    expect(m.set('scale', 1.5)).toEqual({ ok: false, error: 'invalid' });
    expect(m.set('scale', 2)).toEqual({ ok: true });
    expect(m.snapshot().scale).toBe(1.33);
    expect(persisted).toEqual([{ scale: 1.33 }]);
  });
  it('opacity: numbers only, clamped to 0.5-1 in 0.05 steps', () => {
    const { m, log } = make();
    expect(m.set('opacity', '0.8')).toEqual({ ok: false, error: 'invalid' });
    expect(m.set('opacity', NaN)).toEqual({ ok: false, error: 'invalid' });
    expect(m.set('opacity', 0.1)).toEqual({ ok: true });
    expect(m.snapshot().opacity).toBe(0.5);
    expect(log).toContain('opacity:0.5');
  });
  it('placement: preset names only; persists the new position with it', () => {
    const { m, persisted } = make();
    expect(m.set('placement', 'middle')).toEqual({ ok: false, error: 'invalid' });
    expect(m.set('placement', 'bottom-right')).toEqual({ ok: true });
    expect(persisted).toEqual([{ position: { x: 1, y: 2 }, placement: 'bottom-right' }]);
    expect(m.snapshot().placement).toBe('bottom-right');
  });
  it('approvals, awake, autostart validate their values', () => {
    const { m, log, persisted } = make();
    expect(m.set('approvals', 'sometimes')).toEqual({ ok: false, error: 'invalid' });
    expect(m.set('approvals', 'off')).toEqual({ ok: true });
    expect(m.set('awake', 'yes')).toEqual({ ok: false, error: 'invalid' });
    expect(m.set('awake', false)).toEqual({ ok: true });
    expect(m.set('autostart', true)).toEqual({ ok: true });
    expect(log).toContain('approvals:off');
    expect(log).toContain('awake:false');
    expect(m.snapshot().autostart).toBe(true);
    expect(persisted).toEqual([{ approvals: 'off' }, { awake: false }]);
  });
  it('sound validates its value, applies it and is saved', () => {
    const { m, log, persisted } = make();
    expect(m.set('sound', 1)).toEqual({ ok: false, error: 'invalid' });
    expect(m.set('sound', true)).toEqual({ ok: true });
    expect(log).toContain('sound:true');
    expect(m.snapshot().sound).toBe(true);
    expect(persisted).toEqual([{ sound: true }]);
  });
  it('autostart is refused when unavailable (unpackaged)', () => {
    const { m, log } = make({ autostartAvailable: false });
    expect(m.set('autostart', true)).toEqual({ ok: false, error: 'unavailable' });
    expect(log).toEqual([]);
  });
  it('unknown keys are rejected without side effects', () => {
    const { m, log, persisted } = make();
    for (const k of ['port', 'token', '__proto__', 5, undefined]) expect(m.set(k, 'x')).toEqual({ ok: false, error: 'unknown' });
    expect(log).toEqual([]);
    expect(persisted).toEqual([]);
  });
  it('a failing apply reports "failed" and keeps the old value', () => {
    const { m, persisted } = make({ applyLanguage: () => { throw new Error('boom'); } });
    expect(m.set('language', 'en')).toEqual({ ok: false, error: 'failed' });
    expect(m.snapshot().language).toBe('de');
    expect(persisted).toEqual([]);
  });
});

describe('SettingsModel.stepScale and dragged', () => {
  it('stepScale goes one step from the current effective scale', () => {
    const { m, log } = make();
    expect(m.stepScale(1)).toEqual({ ok: true });
    expect(log[0]).toBe('scale:1.33');
    m.stepScale(-1);
    m.stepScale(-1);
    expect(m.snapshot().scale).toBe(0.67);
  });
  it('dragged clears the preset, persists the position and notifies', () => {
    const { m, persisted, log } = make();
    m.dragged({ x: 5, y: 6 });
    expect(m.snapshot().placement).toBeUndefined();
    expect(persisted).toEqual([{ position: { x: 5, y: 6 }, placement: undefined }]);
    expect(log).toEqual(['changed']);
  });
});
