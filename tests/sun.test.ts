import { describe, it, expect } from 'vitest';
import { sunTimes, dayPhaseAt, dayPhase } from '../src/renderer/sun';

describe('sunTimes (Germany default, local clock)', () => {
  it('midsummer: early sunrise, late sunset (CEST)', () => {
    const s = sunTimes(172, -120);
    expect(s.sunrise).toBeGreaterThan(4.5);
    expect(s.sunrise).toBeLessThan(5.7);
    expect(s.sunset).toBeGreaterThan(21);
    expect(s.sunset).toBeLessThan(22.3);
  });
  it('midwinter: late sunrise, early sunset (CET)', () => {
    const s = sunTimes(355, -60);
    expect(s.sunrise).toBeGreaterThan(7.8);
    expect(s.sunrise).toBeLessThan(8.8);
    expect(s.sunset).toBeGreaterThan(15.8);
    expect(s.sunset).toBeLessThan(16.8);
  });
});

describe('dayPhaseAt', () => {
  const sun = { sunrise: 7, sunset: 19 };
  it('maps hours to night/dawn/day/dusk', () => {
    expect(dayPhaseAt(3, sun)).toBe('night');
    expect(dayPhaseAt(6.6, sun)).toBe('dawn');
    expect(dayPhaseAt(7.5, sun)).toBe('dawn');
    expect(dayPhaseAt(12, sun)).toBe('day');
    expect(dayPhaseAt(18.5, sun)).toBe('dusk');
    expect(dayPhaseAt(19.4, sun)).toBe('dusk');
    expect(dayPhaseAt(20, sun)).toBe('night');
  });
});

describe('dayPhase(date)', () => {
  it('noon is day and 2am is night all year', () => {
    for (const m of [0, 3, 6, 9]) {
      expect(dayPhase(new Date(2026, m, 15, 12, 0))).toBe('day');
      expect(dayPhase(new Date(2026, m, 15, 2, 0))).toBe('night');
    }
  });
});
