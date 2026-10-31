// Pure logic of the waiting area: which agent types of the roster sit on the lounge furniture.
import { modelChip } from '../shared/model';
import type { Agent, RosterEntry } from '../shared/types';

export const BENCH_SPOTS = 6;
const NAME_MAX = 12;
const IN_USE = new Set<Agent['status']>(['working', 'waiting', 'error']);

interface BenchFigure {
  type: string;
  /** Compact label: the type without the `kayy-` prefix. */
  name: string;
  model?: string;
  chip: ReturnType<typeof modelChip>;
}

export interface BenchPlan { figures: BenchFigure[]; more: number }

export function benchName(type: string): string {
  const name = type.startsWith('kayy-') && type.length > 5 ? type.slice(5) : type;
  return name.length > NAME_MAX ? name.slice(0, NAME_MAX - 1) + '…' : name;
}

export const typeInUse = (type: string, agents: Agent[]): boolean =>
  agents.some((a) => a.name === type && IN_USE.has(a.status));

/** Roster entries that wait (in roster order, first `capacity` shown) and how many more do not fit. */
export function benchPlan(roster: RosterEntry[] | undefined, agents: Agent[], capacity = BENCH_SPOTS): BenchPlan {
  const seen = new Set<string>();
  const waiting: BenchFigure[] = [];
  for (const e of roster ?? []) {
    if (seen.has(e.type)) continue;
    seen.add(e.type);
    if (typeInUse(e.type, agents)) continue;
    waiting.push({ type: e.type, name: benchName(e.type), model: e.model, chip: modelChip(e.model) });
  }
  return { figures: waiting.slice(0, capacity), more: Math.max(0, waiting.length - capacity) };
}
