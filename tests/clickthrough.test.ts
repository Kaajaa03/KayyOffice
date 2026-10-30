import { describe, it, expect, vi } from 'vitest';
import { resetClickThrough, resetClickThroughWhenIdle } from '../src/main/clickthrough';

const fake = (destroyed = false) => ({ isDestroyed: () => destroyed, setIgnoreMouseEvents: vi.fn() });

describe('resetClickThrough', () => {
  it('makes the overlay click-through again but keeps forwarding mouse moves', () => {
    const w = fake();
    resetClickThrough(w);
    expect(w.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
  });
  it('does nothing for a destroyed window and tolerates a missing one', () => {
    const w = fake(true);
    resetClickThrough(w);
    expect(w.setIgnoreMouseEvents).not.toHaveBeenCalled();
    expect(() => resetClickThrough(undefined)).not.toThrow();
  });
});

describe('resetClickThroughWhenIdle', () => {
  it('resets only when the permission queue is empty (a card may still need clicks)', () => {
    const w = fake();
    resetClickThroughWhenIdle(w, 2);
    expect(w.setIgnoreMouseEvents).not.toHaveBeenCalled();
    resetClickThroughWhenIdle(w, 0);
    expect(w.setIgnoreMouseEvents).toHaveBeenCalledTimes(1);
  });
});
