import type { Agent, AppState } from '../shared/types';

/** Fixed sample office for the tray demo and visual checks (`--demo`). */
export function demoState(now = Date.now()): AppState {
  const mk = (
    id: string, cwd: string, status: Agent['status'], category: Agent['category'] | undefined,
    model: string, extra: Partial<Agent> = {},
  ): Agent => ({ id, sessionId: extra.parentId ?? id, cwd, status, category, model, lastEventTs: now, ...extra });
  const list = [
    mk('planner', 'C:\\ai\\Claude', 'working', 'other', 'claude-opus-5-5', { costUsd: 0.84 }),
    mk('coder', 'C:\\dev\\KayyOffice', 'working', 'code', 'claude-sonnet-5-5', { file: 'C:\\dev\\KayyOffice\\src\\main\\state.ts', costUsd: 1.32 }),
    mk('tester', 'C:\\dev\\KayyOffice', 'working', 'terminal', 'claude-haiku-5-5', { costUsd: 0.07 }),
    mk('researcher', 'C:\\dev\\site', 'working', 'browser', 'claude-haiku-5-5', { costUsd: 0.12 }),
    mk('reviewer', 'C:\\dev\\KayyOffice', 'waiting', undefined, 'claude-opus-5-5', { costUsd: 0.51 }),
    mk('deploy', 'C:\\dev\\infra', 'done', undefined, 'claude-sonnet-5-5', { costUsd: 0.2 }),
    mk('sub1', 'C:\\dev\\KayyOffice', 'error', 'terminal', 'claude-haiku-5-5', { parentId: 'coder' }),
    mk('idle1', 'C:\\dev\\old', 'idle', undefined, 'claude-sonnet-5-5'),
    // done agents at different points of their coffee break: walking, at the machine, in the lounge
    mk('writer', 'C:\\dev\\site', 'done', undefined, 'claude-sonnet-5-5', { lastEventTs: now - 8000, costUsd: 0.31 }),
    mk('docs', 'C:\\dev\\infra', 'done', undefined, 'claude-haiku-5-5', { lastEventTs: now - 120_000, costUsd: 0.04 }),
  ];
  return { agents: Object.fromEntries(list.map((a) => [a.id, a])) };
}

const DEMO_PROJECTS = ['C:\\dev\\KayyOffice', 'C:\\dev\\site', 'C:\\dev\\infra', 'C:\\ai\\Claude'];
const DEMO_STATUS: Agent['status'][] = ['working', 'working', 'waiting', 'done', 'working', 'error', 'idle', 'done', 'working', 'working'];
const DEMO_CATEGORY: Array<Agent['category']> = ['code', 'terminal', 'browser', 'other'];
const DEMO_MODEL = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
export const DEMO_MAX = 60;

/** `--demo-count=<n>`: n agents over 1-4 projects with mixed statuses, for layout checks. */
export function demoCountState(count: number, now = Date.now()): AppState {
  const n = Math.min(DEMO_MAX, Math.max(1, Math.floor(count) || 1));
  const projects = Math.min(DEMO_PROJECTS.length, Math.ceil(n / 6));
  const agents: Record<string, Agent> = {};
  for (let i = 0; i < n; i++) {
    const id = `agent${i + 1}`;
    const parent = i % 5 === 4 ? `agent${i}` : undefined; // every 5th agent is a sub-agent of the one before
    const status = DEMO_STATUS[i % DEMO_STATUS.length];
    const cwd = parent ? agents[parent].cwd : DEMO_PROJECTS[Math.floor((i * projects) / n)];
    const lastEventTs = status === 'done' ? now - [3000, 30_000, 120_000][i % 3] : now;
    agents[id] = {
      id, sessionId: parent ?? id, parentId: parent, cwd, status, lastEventTs,
      category: status === 'working' ? DEMO_CATEGORY[i % DEMO_CATEGORY.length] : undefined,
      model: DEMO_MODEL[i % DEMO_MODEL.length],
      costUsd: parent ? undefined : +(0.05 + (i % 7) * 0.31).toFixed(2),
    };
  }
  return { agents };
}
