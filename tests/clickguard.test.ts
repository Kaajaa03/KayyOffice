import { describe, it, expect } from 'vitest';
import { ClickGuard, ARM_DELAY_MS } from '../src/renderer/clickguard';

const allow = (id: string) => ({ id, decision: 'allow' as const });

describe('ClickGuard', () => {
  it('ignores clicks right after a card appears, accepts them once armed', () => {
    const g = new ClickGuard();
    g.show('r1', 1000);
    g.down(allow('r1'), 1000 + ARM_DELAY_MS - 1);
    expect(g.up(allow('r1'), 1000 + ARM_DELAY_MS - 1)).toBeNull();
    g.down(allow('r1'), 1000 + ARM_DELAY_MS);
    expect(g.up(allow('r1'), 1000 + ARM_DELAY_MS)).toEqual(allow('r1'));
  });
  it('a double click cannot approve the next queued request', () => {
    const g = new ClickGuard();
    g.show('r1', 0);
    g.down(allow('r1'), 2000);
    expect(g.up(allow('r1'), 2000)).toEqual(allow('r1'));
    g.show('r2', 2001); // next card takes the place of the first
    g.down(allow('r2'), 2050);
    expect(g.up(allow('r2'), 2050)).toBeNull();
  });
  it('requires mousedown and mouseup on the same button', () => {
    const g = new ClickGuard();
    g.show('r1', 0);
    g.down({ id: 'r1', decision: 'deny' }, 5000);
    expect(g.up(allow('r1'), 5000)).toBeNull();
  });
  it('a custom (longer) delay for risky requests', () => {
    const g = new ClickGuard();
    g.show('r1', 0, 1500);
    g.down(allow('r1'), 1499);
    expect(g.up(allow('r1'), 1499)).toBeNull();
    g.down(allow('r1'), 1500);
    expect(g.up(allow('r1'), 1500)).toEqual(allow('r1'));
  });
  it('re-showing the same card id does not re-arm the delay', () => {
    const g = new ClickGuard();
    g.show('r1', 0);
    g.show('r1', 4000);
    g.down(allow('r1'), 4001);
    expect(g.up(allow('r1'), 4001)).toEqual(allow('r1'));
  });
});

describe('ClickGuard with option buttons', () => {
  const pick = (id: string, choice: number) => ({ id, decision: 'choice' as const, choice });
  it('needs the arming delay, and down and up on the same option', () => {
    const g = new ClickGuard();
    g.show('q', 1000);
    g.down(pick('q', 0), 1100);
    expect(g.up(pick('q', 0), 1200)).toBeNull(); // not armed yet
    g.down(pick('q', 0), 1700);
    expect(g.up(pick('q', 1), 1710)).toBeNull(); // slid onto another option
    g.down(pick('q', 1), 1800);
    expect(g.up(pick('q', 1), 1810)).toEqual(pick('q', 1));
  });
});
