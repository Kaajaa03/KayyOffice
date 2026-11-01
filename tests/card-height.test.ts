import { describe, expect, it } from 'vitest';
import { CARD_H, cardHeight } from '../src/renderer/card';

const req = (options?: string[]) => ({ id: 'q', agentId: 'a', tool: 'AskUserQuestion', summary: 's', ts: 0, options });

describe('cardHeight', () => {
  it('keeps the fixed height for a permission card', () => {
    expect(cardHeight(req())).toBe(CARD_H);
  });

  it('grows with every stacked option of a question card', () => {
    expect(cardHeight(req(['a', 'b', 'c']))).toBeGreaterThan(cardHeight(req(['a', 'b'])));
    expect(cardHeight(req(['a', 'b', 'c', 'd']))).toBe(cardHeight(req(['a', 'b', 'c'])) + 28);
  });
});
