import type { Agent, AppState, RosterEntry } from '../shared/types';

/** Agent types the demo offers; two of them are in use by demo agents, the rest wait on the bench. */
const DEMO_ROSTER: RosterEntry[] = [
  { type: 'kayy-scout', model: 'haiku' },
  { type: 'kayy-coder', model: 'sonnet' },
  { type: 'kayy-tester', model: 'sonnet' },
  { type: 'kayy-reviewer', model: 'sonnet' },
  { type: 'kayy-architect', model: 'opus' },
  { type: 'codex-worker' },
];

/** Fixed sample office for the tray demo and visual checks (`--demo`). */
export function demoState(now = Date.now()): AppState {
  const mk = (
    id: string, cwd: string, status: Agent['status'], category: Agent['category'] | undefined,
    model: string, extra: Partial<Agent> = {},
  ): Agent => ({ id, sessionId: extra.parentId ?? id, cwd, status, category, model, lastEventTs: now, ...extra });
  const list = [
    mk('planner', 'C:\\ai\\Claude', 'working', 'other', 'claude-opus-5-5', { costUsd: 0.84, name: 'kayy-architect', limit: { kind: 'five_hour', percent: 62 } }),
    mk('coder', 'C:\\dev\\KayyOffice', 'working', 'code', 'claude-sonnet-5-5', {
      file: 'C:\\dev\\KayyOffice\\src\\main\\state.ts', costUsd: 1.32, name: 'kayy-coder', context: { percent: 34, tokens: 68_000, window: 200_000 }, progress: { done: 3, total: 7, current: 'Reducer testen' },
    }),
    mk('tester', 'C:\\dev\\KayyOffice', 'working', 'terminal', 'claude-haiku-5-5', { costUsd: 0.07, progress: { done: 5, total: 6, current: 'Suite ausführen' } }),
    mk('researcher', 'C:\\dev\\site', 'working', 'browser', 'claude-haiku-5-5', { costUsd: 0.12 }),
    mk('reviewer', 'C:\\dev\\KayyOffice', 'waiting', undefined, 'claude-opus-5-5', { costUsd: 0.51 }),
    mk('deploy', 'C:\\dev\\infra', 'done', undefined, 'claude-sonnet-5-5', { costUsd: 0.2 }),
    mk('sub1', 'C:\\dev\\KayyOffice', 'error', 'terminal', 'claude-haiku-5-5', { parentId: 'coder' }),
    mk('idle1', 'C:\\dev\\old', 'idle', undefined, 'claude-sonnet-5-5'),
    // done agents at different points of their coffee break: walking, at the machine, in the lounge
    mk('writer', 'C:\\dev\\site', 'done', undefined, 'claude-sonnet-5-5', { lastEventTs: now - 8000, costUsd: 0.31 }),
    mk('docs', 'C:\\dev\\infra', 'done', undefined, 'claude-haiku-5-5', { lastEventTs: now - 120_000, costUsd: 0.04 }),
  ];
  return { agents: Object.fromEntries(list.map((a) => [a.id, a])), roster: DEMO_ROSTER };
}

const DEMO_PROJECTS = ['C:\\dev\\KayyOffice', 'C:\\dev\\site', 'C:\\dev\\infra', 'C:\\ai\\Claude'];
const DEMO_STATUS: Agent['status'][] = ['working', 'working', 'waiting', 'done', 'working', 'error', 'idle', 'done', 'working', 'working'];
const DEMO_CATEGORY: Array<Agent['category']> = ['code', 'terminal', 'browser', 'other'];
const DEMO_MODEL = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const DEMO_MAX = 60;

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
  agents.agent1.name = 'kayy-architect';
  agents.agent1.context = { percent: 34 };
  agents.agent1.limit = { kind: 'five_hour', percent: 62 };
  if (agents.agent2) agents.agent2.name = 'kayy-coder';
  const types = ['kayy-coder', 'kayy-architect']; // the two types the demo keeps off the bench
  Object.values(agents).filter((a) => a.parentId && !a.name).forEach((a, i) => { a.name = types[i % types.length]; });
  return { agents, roster: DEMO_ROSTER };
}
