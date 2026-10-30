// Pure name-pill text (Lumio style: name + status dot, second line = what the agent is doing).
import { t } from '../shared/i18n';
import type { Key, Lang } from '../shared/i18n';
import type { Agent, AgentStatus } from '../shared/types';

const STATUS_DOT: Record<AgentStatus, string> = {
  working: '#51cf66', waiting: '#ffa94d', done: '#4dabf7', idle: '#868e96', error: '#ff6b6b',
};

const SUB: Record<AgentStatus, Key> = {
  working: 'pill.working', waiting: 'pill.waiting', done: 'pill.done', idle: 'pill.idle', error: 'pill.error',
};

const CATEGORY: Record<string, Key> = {
  code: 'pill.code', terminal: 'pill.terminal', browser: 'pill.browser', other: 'pill.thinking',
};

const trunc = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s);

const projectName = (a: Agent): string => a.cwd.split(/[\\/]/).filter(Boolean).pop() ?? a.id.slice(0, 6);

export function labelFor(a: Agent, lang: Lang): string {
  if (a.role) return a.role;
  if (a.parentId) return t(lang, 'label.subAgent');
  return projectName(a);
}

interface PillLines {
  title: string;
  sub: string;
  dot: string;
  /** Share of completed tasks (0..1) when the agent reported a task list. */
  progress?: number;
}

export function pillLines(a: Agent, lang: Lang): PillLines {
  let sub = t(lang, SUB[a.status]);
  // the Claude mod flags real decisions (AskUserQuestion / plan approval) with this message prefix
  if (a.status === 'waiting' && a.message?.startsWith('Entscheidung')) sub = t(lang, 'pill.decision');
  if (a.status === 'working') {
    const file = a.file?.split(/[\\/]/).filter(Boolean).pop();
    sub = a.progress?.current ?? file ?? t(lang, CATEGORY[a.category ?? 'other']);
  }
  const progress = a.progress ? a.progress.done / a.progress.total : undefined;
  return { title: trunc(labelFor(a, lang), 14), sub: trunc(sub, 16), dot: STATUS_DOT[a.status], progress };
}

function askerBase(a: Agent, lang: Lang): string {
  const parts = [a.role ?? projectName(a)];
  if (a.name && a.name !== a.role) parts.push(a.name);
  else if (a.parentId && !a.name) parts.push(t(lang, 'label.subAgent'));
  return parts.join(' · ');
}

/** Who really asks on a permission card: role/project, agent type, and a short session id when the label is ambiguous. */
export function askerLabel(agent: Agent | undefined, agentId: string, all: Agent[], lang: Lang): string {
  if (!agent) return agentId.slice(0, 8);
  const base = askerBase(agent, lang);
  const clash = all.some((o) => o.id !== agent.id && askerBase(o, lang) === base);
  return clash ? `${base} · #${agent.sessionId.slice(0, 6)}` : base;
}
