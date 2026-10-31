import { describe, expect, it } from 'vitest';
import { AttentionSound } from '../src/main/sound';
import type { Agent, AppState } from '../src/shared/types';

const state = (...a: Array<[string, Agent['status']]>): AppState => ({
  agents: Object.fromEntries(a.map(([id, status]) => [id, { id, sessionId: id, cwd: 'C:\\p', status, lastEventTs: 0 } as Agent])),
});

describe('AttentionSound', () => {
  it('beeps once when an agent starts waiting, not while it keeps waiting', () => {
    let n = 0;
    const s = new AttentionSound(() => n++, true);
    s.update(state(['a', 'working']));
    s.update(state(['a', 'waiting']));
    s.update(state(['a', 'waiting']));
    expect(n).toBe(1);
    s.update(state(['a', 'working']));
    s.update(state(['a', 'waiting']));
    expect(n).toBe(2);
  });
  it('stays silent when switched off and does not beep for a switch-on later', () => {
    let n = 0;
    const s = new AttentionSound(() => n++);
    s.update(state(['a', 'waiting']));
    s.setEnabled(true);
    s.update(state(['a', 'waiting']));
    expect(n).toBe(0);
  });
});
