import { describe, it, expect } from 'vitest';
import { parseEvent } from '../src/main/validate';

const good = { ts: 1, sessionId: 's', agentId: 's', event: 'PreToolUse', cwd: 'C:\\x', tool: 'Bash' };

describe('parseEvent', () => {
  it('returns valid event unchanged', () => expect(parseEvent(good)).toEqual(good));
  it('keeps agentType (truncated to 100 chars)', () => {
    expect(parseEvent({ ...good, agentType: 'security-reviewer' })!.agentType).toBe('security-reviewer');
    expect(parseEvent({ ...good, agentType: 'x'.repeat(500) })!.agentType).toHaveLength(100);
  });
  it('rejects missing sessionId', () => expect(parseEvent({ ...good, sessionId: undefined })).toBeNull());
  it('rejects unknown event name', () => expect(parseEvent({ ...good, event: 'Nope' })).toBeNull());
  it('truncates message to 500 chars', () => {
    expect(parseEvent({ ...good, message: 'x'.repeat(10_000) })!.message).toHaveLength(500);
  });
  it.each([null, 'x', 42, []])('rejects non-object %p', (v) => expect(parseEvent(v)).toBeNull());
});
