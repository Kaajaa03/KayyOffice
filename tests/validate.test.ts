import { describe, it, expect } from 'vitest';
import { parseEvent } from '../src/main/validate';

const good = { ts: 1, sessionId: 's', agentId: 's', event: 'PreToolUse', cwd: 'C:\\x', tool: 'Bash' };

describe('parseEvent', () => {
  it('returns valid event unchanged', () => expect(parseEvent(good)).toEqual(good));
  it('keeps agentType (truncated to 100 chars)', () => {
    expect(parseEvent({ ...good, agentType: 'security-reviewer' })!.agentType).toBe('security-reviewer');
    expect(parseEvent({ ...good, agentType: 'x'.repeat(500) })!.agentType).toHaveLength(100);
  });
  it('keeps source, model, file and costUsd; truncates; rejects bad values', () => {
    const e = parseEvent({ ...good, source: 'mod', model: 'opus', file: 'C:\\a\\b.ts', costUsd: 1.5 })!;
    expect(e).toMatchObject({ source: 'mod', model: 'opus', file: 'C:\\a\\b.ts', costUsd: 1.5 });
    expect(parseEvent({ ...good, file: 'x'.repeat(500) })!.file).toHaveLength(200);
    expect(parseEvent({ ...good, model: 'm'.repeat(500) })!.model).toHaveLength(100);
    expect(parseEvent({ ...good, source: 'evil' })!.source).toBeUndefined();
    expect(parseEvent({ ...good, costUsd: -1 })!.costUsd).toBeUndefined();
    expect(parseEvent({ ...good, costUsd: Number.NaN })!.costUsd).toBeUndefined();
  });
  it('rejects missing sessionId', () => expect(parseEvent({ ...good, sessionId: undefined })).toBeNull());
  it('rejects unknown event name', () => expect(parseEvent({ ...good, event: 'Nope' })).toBeNull());
  it('truncates message to 500 chars', () => {
    expect(parseEvent({ ...good, message: 'x'.repeat(10_000) })!.message).toHaveLength(500);
  });
  it.each([null, 'x', 42, []])('rejects non-object %p', (v) => expect(parseEvent(v)).toBeNull());
});
