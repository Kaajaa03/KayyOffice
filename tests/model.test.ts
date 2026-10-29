import { describe, it, expect } from 'vitest';
import { modelChip, formatCost } from '../src/shared/model';

describe('modelChip', () => {
  it.each([
    ['haiku', 'H'], ['claude-haiku-5-5', 'H'], ['sonnet', 'S'], ['claude-sonnet-5-5', 'S'],
    ['opus', 'O'], ['claude-opus-5-5', 'O'], ['claude-fable-5-1', 'F'],
  ])('%s -> %s', (m, letter) => expect(modelChip(m)?.letter).toBe(letter));
  it('has distinct colors per family', () => {
    const colors = ['haiku', 'sonnet', 'opus', 'fable'].map((m) => modelChip(m)!.color);
    expect(new Set(colors).size).toBe(4);
  });
  it('falls back to a neutral chip for unknown models and none for undefined', () => {
    expect(modelChip('gpt-x')).toMatchObject({ letter: '?' });
    expect(modelChip(undefined)).toBeNull();
  });
});

describe('formatCost', () => {
  it('formats dollars with 2 decimals, 3 below one cent', () => {
    expect(formatCost(1.234)).toBe('$1.23');
    expect(formatCost(0.004)).toBe('$0.004');
    expect(formatCost(0)).toBe('$0.00');
  });
});
