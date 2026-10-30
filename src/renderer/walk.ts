// Pure "done -> coffee -> lounge" state machine and path walking.
import type { Agent } from '../shared/types';
import type { Pt } from './room';

export const WALK_MS = 4000;
export const COFFEE_MS = 20_000;
const LOUNGE_WALK_MS = 4000;

type DonePhase = 'toCoffee' | 'coffee' | 'toLounge' | 'lounge';

/**
 * Where a finished agent is, `elapsed` ms after it became done. t = progress within the phase.
 * `reduced` (prefers-reduced-motion): no walking, the agent relocates instantly (coffee machine, then lounge).
 */
export function doneTimeline(elapsed: number, reduced = false): { phase: DonePhase; t: number } {
  const e = Math.max(0, elapsed);
  if (reduced) return e < WALK_MS + COFFEE_MS ? { phase: 'coffee', t: e / (WALK_MS + COFFEE_MS) } : { phase: 'lounge', t: 1 };
  if (e < WALK_MS) return { phase: 'toCoffee', t: e / WALK_MS };
  if (e < WALK_MS + COFFEE_MS) return { phase: 'coffee', t: (e - WALK_MS) / COFFEE_MS };
  if (e < WALK_MS + COFFEE_MS + LOUNGE_WALK_MS) return { phase: 'toLounge', t: (e - WALK_MS - COFFEE_MS) / LOUNGE_WALK_MS };
  return { phase: 'lounge', t: 1 };
}

export function isWalking(agent: Agent, now: number, reduced = false): boolean {
  if (reduced || agent.status !== 'done') return false;
  const p = doneTimeline(now - agent.lastEventTs).phase;
  return p === 'toCoffee' || p === 'toLounge';
}

/** Leave via the aisle, walk along it, then go straight to the target. */
export function walkPath(from: Pt, to: Pt, aisleY: number): Pt[] {
  const pts = [from, { x: from.x, y: aisleY }, { x: to.x, y: aisleY }, to];
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
}

type Dir = 'left' | 'right' | 'up' | 'down';
interface Walker extends Pt { dir: Dir; frame: 0 | 1 }

const dirOf = (a: Pt, b: Pt): Dir =>
  b.x !== a.x ? (b.x > a.x ? 'right' : 'left') : b.y < a.y ? 'up' : 'down';

/** Position at progress t (0..1, by distance) with walking direction and 2-frame cycle. */
export function pointAlong(path: Pt[], t: number): Walker {
  if (path.length < 2) return { ...path[0], dir: 'down', frame: 0 };
  const lens = path.slice(1).map((p, i) => Math.abs(p.x - path[i].x) + Math.abs(p.y - path[i].y));
  const total = lens.reduce((s, l) => s + l, 0);
  let d = Math.min(1, Math.max(0, t)) * total;
  const frame = (Math.floor(d / 4) % 2) as 0 | 1;
  for (let i = 0; i < lens.length; i++) {
    const a = path[i], b = path[i + 1];
    if (d <= lens[i] || i === lens.length - 1) {
      const f = lens[i] ? Math.min(1, d / lens[i]) : 1;
      return { x: Math.round(a.x + (b.x - a.x) * f), y: Math.round(a.y + (b.y - a.y) * f), dir: dirOf(a, b), frame };
    }
    d -= lens[i];
  }
  return { ...path[path.length - 1], dir: 'down', frame };
}
