import { describe, it, expect } from 'vitest';
import { MAX_OPACITY, MIN_OPACITY, clampOpacity, parseOpacity } from '../src/main/opacity';

describe('opacity', () => {
  it('limits are 0.5 and 1', () => { expect(MIN_OPACITY).toBe(0.5); expect(MAX_OPACITY).toBe(1); });
  it('clamps into range and rounds to 0.05 steps', () => {
    expect(clampOpacity(0.1)).toBe(0.5);
    expect(clampOpacity(7)).toBe(1);
    expect(clampOpacity(0.73)).toBe(0.75);
    expect(clampOpacity(0.7)).toBe(0.7);
    expect(clampOpacity(0.85)).toBe(0.85);
  });
  it('parseOpacity: default 1 for invalid input, clamps valid numbers', () => {
    for (const bad of [undefined, null, 'a', NaN, Infinity, {}]) expect(parseOpacity(bad)).toBe(1);
    expect(parseOpacity(0.6)).toBe(0.6);
    expect(parseOpacity(0.2)).toBe(0.5);
  });
});
