import { describe, it, expect, vi, afterEach } from 'vitest';
import { PermissionQueue, PERMISSION_TIMEOUT_MS } from '../src/main/control';

const req = (id: string) => ({ id, agentId: 'a', tool: 'Bash', summary: 'ls' });
afterEach(() => vi.useRealTimers());

describe('PermissionQueue', () => {
  it('resolves with the user decision', async () => {
    const q = new PermissionQueue();
    const p = q.add(req('1'));
    expect(q.pending()).toHaveLength(1);
    expect(q.resolve('1', 'allow')).toBe(true);
    await expect(p).resolves.toBe('allow');
    expect(q.pending()).toHaveLength(0);
  });
  it("falls back to 'ask' after the timeout", async () => {
    vi.useFakeTimers();
    const q = new PermissionQueue();
    const p = q.add(req('1'));
    vi.advanceTimersByTime(PERMISSION_TIMEOUT_MS);
    await expect(p).resolves.toBe('ask');
    expect(q.pending()).toHaveLength(0);
  });
  it("dispose() resolves all waiting requests with 'ask' (app shutdown)", async () => {
    const q = new PermissionQueue();
    const a = q.add(req('1'));
    const b = q.add(req('2'));
    q.dispose();
    await expect(Promise.all([a, b])).resolves.toEqual(['ask', 'ask']);
  });
  it("aborted request (hook killed) resolves with 'ask' and leaves the queue", async () => {
    const q = new PermissionQueue();
    const ac = new AbortController();
    const p = q.add(req('1'), ac.signal);
    ac.abort();
    await expect(p).resolves.toBe('ask');
    expect(q.pending()).toHaveLength(0);
  });
  it('resolve() of an unknown id returns false', () => {
    expect(new PermissionQueue().resolve('nope', 'deny')).toBe(false);
  });
  it('notifies on change', () => {
    const onChange = vi.fn();
    const q = new PermissionQueue({ onChange });
    void q.add(req('1'));
    q.resolve('1', 'deny');
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
