import type { Agent, AppState } from '../shared/types';

/** Fixed sample office for visual checks (`--demo`). */
export function demoState(now = Date.now()): AppState {
  const mk = (id: string, cwd: string, status: Agent['status'], category?: Agent['category'], parentId?: string): Agent => ({
    id, sessionId: parentId ?? id, parentId, cwd, status, category, lastEventTs: now,
  });
  const list = [
    mk('planner', 'C:\\ai\\Claude', 'working', 'other'),
    mk('coder', 'C:\\dev\\KayyOffice', 'working', 'code'),
    mk('tester', 'C:\\dev\\KayyOffice', 'working', 'terminal'),
    mk('researcher', 'C:\\dev\\site', 'working', 'browser'),
    mk('reviewer', 'C:\\dev\\KayyOffice', 'waiting'),
    mk('deploy', 'C:\\dev\\infra', 'done'),
    mk('sub1', 'C:\\dev\\KayyOffice', 'error', 'terminal', 'coder'),
    mk('idle1', 'C:\\dev\\old', 'idle'),
  ];
  return { agents: Object.fromEntries(list.map((a) => [a.id, a])) };
}
