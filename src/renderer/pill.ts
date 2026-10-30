// Pure name-pill text (Lumio style: name + status dot, second line = what the agent is doing).
import type { Agent, AgentStatus } from '../shared/types';

export const STATUS_DOT: Record<AgentStatus, string> = {
  working: '#51cf66', waiting: '#ffa94d', done: '#4dabf7', idle: '#868e96', error: '#ff6b6b',
};

const SUB: Record<AgentStatus, string> = {
  working: 'working', waiting: 'needs you', done: 'done', idle: 'idle', error: 'error',
};

const CATEGORY: Record<string, string> = { code: 'code', terminal: 'terminal', browser: 'browser', other: 'thinking' };

export const trunc = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function labelFor(a: Agent): string {
  if (a.role) return a.role;
  if (a.parentId) return 'sub-agent';
  const parts = a.cwd.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? a.id.slice(0, 6);
}

export interface PillLines { title: string; sub: string; dot: string }

export function pillLines(a: Agent): PillLines {
  let sub = SUB[a.status];
  if (a.status === 'working') {
    const file = a.file?.split(/[\\/]/).filter(Boolean).pop();
    sub = file ?? CATEGORY[a.category ?? 'other'];
  }
  return { title: trunc(labelFor(a), 14), sub: trunc(sub, 16), dot: STATUS_DOT[a.status] };
}
