import { describe, it, expect, vi, afterEach } from 'vitest';
import { AwakeManager } from '../src/main/power';
import type { Agent, AppState } from '../src/shared/types';

const st = (...status: Agent['status'][]): AppState => ({
  agents: Object.fromEntries(status.map((s, i) => [`a${i}`, { id: `a${i}`, sessionId: `a${i}`, cwd: 'x', status: s, lastEventTs: 0 } as Agent])),
});
const blocker = () => ({ start: vi.fn(() => 7), stop: vi.fn() });
afterEach(() => vi.useRealTimers());

describe('AwakeManager', () => {
  it('starts once while agents work', () => {
    const b = blocker();
    const m = new AwakeManager(b);
    m.update(st('working'));
    m.update(st('working', 'waiting'));
    expect(b.start).toHaveBeenCalledTimes(1);
    expect(b.start).toHaveBeenCalledWith('prevent-app-suspension');
  });
  it('does not block sleep for agents that only wait for the user', () => {
    const b = blocker();
    const m = new AwakeManager(b);
    m.update(st('waiting', 'idle'));
    expect(b.start).not.toHaveBeenCalled();
  });
  it('stops 60 s after all agents are idle/done', () => {
    vi.useFakeTimers();
    const b = blocker();
    const m = new AwakeManager(b);
    m.update(st('working'));
    m.update(st('idle', 'done'));
    vi.advanceTimersByTime(59_000);
    expect(b.stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(b.stop).toHaveBeenCalledWith(7);
  });
  it('cancels the pending stop when work resumes', () => {
    vi.useFakeTimers();
    const b = blocker();
    const m = new AwakeManager(b);
    m.update(st('working'));
    m.update(st('idle'));
    m.update(st('working'));
    vi.advanceTimersByTime(120_000);
    expect(b.stop).not.toHaveBeenCalled();
    expect(b.start).toHaveBeenCalledTimes(1);
  });
  it('never starts when disabled, and stops immediately when disabled later', () => {
    const b = blocker();
    const off = new AwakeManager(b, { enabled: false });
    off.update(st('working'));
    expect(b.start).not.toHaveBeenCalled();
    const on = new AwakeManager(b);
    on.update(st('working'));
    on.setEnabled(false);
    expect(b.stop).toHaveBeenCalledWith(7);
  });
});
