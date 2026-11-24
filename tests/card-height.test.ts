import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CARD_H, cardHeight, optionRowHeight } from '../src/renderer/card';

// node env has no canvas: a fake one measuring 6 px per character is enough for wrapping logic
beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ font: '', measureText: (t: string) => ({ width: t.length * 6 }) }) }) });
});

const req = (options?: string[]) => ({ id: 'q', agentId: 'a', tool: 'AskUserQuestion', summary: 's', ts: 0, options });

describe('cardHeight', () => {
  it('keeps the fixed height for a permission card', () => {
    expect(cardHeight(req())).toBe(CARD_H);
  });

  it('grows with every stacked option of a question card', () => {
    expect(cardHeight(req(['a', 'b', 'c']))).toBeGreaterThan(cardHeight(req(['a', 'b'])));
    expect(cardHeight(req(['a', 'b', 'c', 'd']))).toBe(cardHeight(req(['a', 'b', 'c'])) + 28);
  });

  it('an option with a description gets a taller row, the others keep theirs', () => {
    const withDesc = { ...req(['a', 'b']), descriptions: ['', 'details'] };
    expect(optionRowHeight(withDesc, 0)).toBe(28);
    expect(optionRowHeight(withDesc, 1)).toBeGreaterThan(28);
    expect(cardHeight(withDesc)).toBe(cardHeight(req(['a', 'b'])) + (optionRowHeight(withDesc, 1) - 28));
  });
});

describe('long descriptions', () => {
  it('wrap onto more lines (max 3), so a long text makes the row taller than a short one', () => {
    const long = { ...req(['a']), descriptions: [('Dieser Text ist lang genug, um mehrfach umzubrechen. ').repeat(4)] };
    const short = { ...req(['a']), descriptions: ['kurz'] };
    expect(optionRowHeight(long, 0)).toBeGreaterThan(optionRowHeight(short, 0));
    expect(optionRowHeight({ ...long, descriptions: ['wort '.repeat(500)] }, 0)).toBeLessThanOrEqual(28 + 3 * 12 + 3);
  });
});
