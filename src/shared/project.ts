import type { Agent } from './types';

/** Project name = last folder of the agent's cwd (Windows or posix). */
export function projectOf(agent: Pick<Agent, 'cwd'>): string {
  const parts = agent.cwd.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? '(unknown)';
}
