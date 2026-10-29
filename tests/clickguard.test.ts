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
