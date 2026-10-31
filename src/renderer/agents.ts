// Everything that is drawn per frame in front of the static room: seated, waiting and walking
// agents, their chairs/monitors/effects and the bench figures, as z-sorted drawables.
import type { Agent } from '../shared/types';
import type { BenchPlan } from './bench';
import { bottomChairY, chairBackSprite, monitorBackSprite, monitorBackY, monitorFrontY } from './furniture';
import { blit, glowSprite, r, rects, tick } from './pixels';
import type { Ctx } from './pixels';
import { lookFor, personSprite } from './people';
import type { Pose } from './people';
import { P } from './room';
import type { Pt, Room, Seat } from './room';
import { drawScreen } from './screens';
import type { DayPhase } from './sun';
import { BENCH_TAG_H, PILL_H, benchTagWidth } from './text';
import type { Chip } from './text';
import { doneTimeline, pointAlong, walkPath } from './walk';

export interface Drawable { z: number; draw: () => void; pill?: { x: number; top: number; agent: Agent } }
export interface BenchTag { cx: number; top: number; w: number; name: string; chip: Chip }

/** What every piece needs to draw itself this frame. */
interface Env { c: Ctx; t: number; ph: DayPhase; dpr: number; night: boolean }
type Look = ReturnType<typeof lookFor>;

const WHITE = '#ffffff';
const RED = '#e03131';
const SCREEN_LIT = new Set<Agent['status']>(['working', 'error', 'waiting']);

const alpha = (c: Ctx, a: number, paint: () => void): void => {
  c.globalAlpha = a;
  paint();
  c.globalAlpha = 1;
};
const glow = (e: Env, color: string, rad: number, x: number, y: number, a: number): void =>
  alpha(e.c, a, () => blit(e.c, glowSprite(color, rad, e.dpr), x, y, e.dpr));
const person = (e: Env, look: Look, pose: Pose, x: number, y: number): void =>
  blit(e.c, personSprite(look, pose, e.dpr, e.ph), x - 4, y, e.dpr);

const WALK_POSE: Record<string, [Pose, Pose]> = { up: ['back0', 'back1'], right: ['sideR0', 'sideR1'], left: ['sideL0', 'sideL1'], down: ['walk0', 'walk1'] };

const standPt = (s: Seat): Pt => ({ x: s.x, y: s.y - (s.facing === 'up' ? 1 : 5) });

/** Monitor (+ chair for the near row) of a desk, drawn behind/in front of its person by z. */
function deskPieces(e: Env, a: Agent, s: Seat): Drawable[] {
  const { c, t, ph, dpr } = e;
  const lit = e.night && SCREEN_LIT.has(a.status);
  if (s.facing === 'up') {
    const my = monitorFrontY(s);
    return [
      { z: s.y - 1, draw: () => { if (lit) glow(e, 'rgba(140,190,255,0.9)', 14, s.x - 14, my - 9, 0.55); drawScreen(c, a, s.x, my, t); } },
      { z: s.y + 15, draw: () => blit(c, chairBackSprite(dpr, ph), s.x - 6, bottomChairY(s), dpr) },
    ];
  }
  const my = monitorBackY(s);
  const led = a.status === 'working' ? '#51cf66' : a.status === 'error' ? (tick(t, 300) ? '#ff6b6b' : '#7f1d1d') : a.status === 'waiting' ? '#ffa94d' : '#6c7380';
  return [{ z: s.y + 10, draw: () => { blit(c, monitorBackSprite(dpr, ph), s.x - 7, my, dpr); r(c, s.x + 5, my + 7, 1, 1, led); } }];
}

/** Finished agent: walks to the coffee machine, drinks, walks to the lounge, rests there. */
function doneFigure(e: Env, room: Room, s: Seat, look: Look, tl: ReturnType<typeof doneTimeline>, a: Agent, ci: number, li: number, still: boolean): Drawable {
  const stand = standPt(s);
  const coffee = { x: room.coffee.x + ci * 9, y: room.coffee.y + (ci % 2) * 2 };
  const spot = room.loungeSpots[li % room.loungeSpots.length];
  let pos: Pt, pose: Pose, steam = false;
  if (tl.phase === 'toCoffee' || tl.phase === 'toLounge') {
    const w = pointAlong(tl.phase === 'toCoffee' ? walkPath(stand, coffee, s.aisleY) : walkPath(coffee, spot, room.wallAisleY), tl.t);
    pos = w; pose = WALK_POSE[w.dir][w.frame];
  } else if (tl.phase === 'coffee') {
    pos = coffee; pose = 'cup'; steam = !still;
  } else {
    pos = spot; pose = 'lounge'; steam = !still;
  }
  return {
    z: pos.y + 16,
    draw: () => {
      person(e, look, pose, pos.x, pos.y);
      if (!steam) return;
      const k = tick(e.t, 300, 3), x = pose === 'cup' ? pos.x + 3 : pos.x;
      alpha(e.c, 0.75, () => { r(e.c, x, pos.y + 6 - k, 1, 1, WHITE); r(e.c, x + 1, pos.y + 5 - ((k + 1) % 3), 1, 1, WHITE); });
    },
    pill: { x: pos.x, top: pos.y * P - PILL_H - 2, agent: a },
  };
}

const IDLE_STEP_MS = [4000, 8000, 4000, 8000];
const idHash = (id: string): number => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** Idle loop (toCoffee, coffee, toLounge, lounge) with a per-agent phase offset; reduced = no walking. */
export function idleTimeline(ms: number, id: string, reduced = false): { phase: 'toCoffee' | 'coffee' | 'toLounge' | 'lounge'; t: number } {
  const total = IDLE_STEP_MS.reduce((x, y) => x + y, 0);
  let m = (Math.max(0, ms) + (idHash(id) % total)) % total;
  const phases = ['toCoffee', 'coffee', 'toLounge', 'lounge'] as const;
  for (let i = 0; i < 4; i++) {
    if (m < IDLE_STEP_MS[i]) return { phase: reduced ? (i < 2 ? 'coffee' : 'lounge') : phases[i], t: m / IDLE_STEP_MS[i] };
    m -= IDLE_STEP_MS[i];
  }
  return { phase: 'lounge', t: 1 };
}

/** Idle agent wanders: coffee machine, lounge spot, pause, repeat. */
function idleFigure(e: Env, room: Room, look: Look, a: Agent, ci: number, li: number, still: boolean): Drawable {
  const spot = room.loungeSpots[li % room.loungeSpots.length];
  const coffee = { x: room.coffee.x + ci * 9, y: room.coffee.y + (ci % 2) * 2 };
  const tl = idleTimeline(Date.now(), a.id, still);
  let pos: Pt, pose: Pose;
  if (tl.phase === 'toCoffee' || tl.phase === 'toLounge') {
    const w = pointAlong(tl.phase === 'toCoffee' ? walkPath(spot, coffee, room.wallAisleY) : walkPath(coffee, spot, room.wallAisleY), tl.t);
    pos = w; pose = WALK_POSE[w.dir][w.frame];
  } else if (tl.phase === 'coffee') {
    pos = coffee; pose = 'cup';
  } else {
    pos = spot; pose = 'lounge';
  }
  return {
    z: pos.y + 16,
    draw: () => person(e, look, pose, pos.x, pos.y),
    pill: { x: pos.x, top: pos.y * P - PILL_H - 2, agent: a },
  };
}

/** Agent waiting for a decision: steps next to the desk, glows, holds up a "!" sign. */
function waitingFigure(e: Env, s: Seat, look: Look, a: Agent): Drawable {
  const p = { x: s.x + (s.facing === 'up' ? 11 : -11), y: standPt(s).y - tick(e.t, 350) };
  return {
    z: standPt(s).y + 16,
    draw: () => {
      glow(e, 'rgba(255,169,77,0.85)', 16, p.x - 16, p.y - 6, 0.45 + 0.25 * Math.sin(e.t / 250));
      person(e, look, 'stand', p.x, p.y);
      rects(e.c, p.x, p.y, [[5, -6, 7, 7, WHITE], [5, 1, 2, 1, WHITE], [8, -5, 1, 3, RED], [8, -1, 1, 1, RED]]);
    },
    pill: { x: p.x, top: (p.y - 7) * P - PILL_H, agent: a },
  };
}

/** Working/idle/error agent at the desk: typing arms, error blinks. */
function seatedFigure(e: Env, s: Seat, look: Look, a: Agent, still: boolean): Drawable {
  const up = s.facing === 'up';
  const typing = a.status === 'working' ? (still ? 1 : tick(e.t, 130)) : 0;
  const pose: Pose = up ? (typing ? 'seatBack1' : 'seatBack0') : 'seatFront';
  return {
    z: s.y + (up ? 14 : 9),
    draw: () => {
      person(e, look, pose, s.x, s.y);
      if (!up && e.night && SCREEN_LIT.has(a.status)) glow(e, 'rgba(150,200,255,0.9)', 7, s.x - 7, s.y - 2, 0.5);
      if (a.status !== 'error') return;
      const blink = tick(e.t, 300);
      const lamp = blink ? RED : '#ff8787';
      r(e.c, s.x + 5, s.y + 1 + blink, 1, 2, '#74c0fc');
      r(e.c, s.x - 1, s.y - 5, 2, 3, lamp);
      r(e.c, s.x - 1, s.y - 1, 2, 1, lamp);
    },
    pill: { x: s.x, top: up ? (bottomChairY(s) + 8) * P + 1 : s.y * P - PILL_H - 2, agent: a },
  };
}

/** Person, chair, monitor and effects of every seated agent. `still` = reduced motion. */
export function agentDrawables(c: Ctx, room: Room, seated: Array<{ a: Agent; s: Seat }>, t: number, ph: DayPhase, dpr: number, still: boolean): Drawable[] {
  const e: Env = { c, t, ph, dpr, night: ph === 'night' || ph === 'dusk' };
  const wall = Date.now();
  const timeline = new Map(seated.filter(({ a }) => a.status === 'done').map(({ a }) => [a.id, doneTimeline(wall - a.lastEventTs, still)]));
  // agents sharing the coffee machine / lounge get different spots
  const coffeeIdx = new Map<string, number>(), loungeIdx = new Map<string, number>();
  for (const { a } of seated) {
    const tl = timeline.get(a.id);
    if (!tl && a.status !== 'idle') continue;
    if (a.status === 'idle') { coffeeIdx.set(a.id, coffeeIdx.size); loungeIdx.set(a.id, loungeIdx.size); continue; }
    const idx = tl && (tl.phase === 'toCoffee' || tl.phase === 'coffee') ? coffeeIdx : loungeIdx;
    idx.set(a.id, idx.size);
  }
  return seated.flatMap(({ a, s }) => {
    const look = lookFor(a);
    const tl = timeline.get(a.id);
    const ci = coffeeIdx.get(a.id) ?? 0, li = loungeIdx.get(a.id) ?? 0;
    // more resting agents than lounge spots stay at their desk instead of stacking on one spot
    const resting = (tl || a.status === 'idle') && li < room.loungeSpots.length;
    const figure = resting && tl ? doneFigure(e, room, s, look, tl, a, ci, li, still)
      : resting ? idleFigure(e, room, look, a, ci, li, still)
      : a.status === 'waiting' ? waitingFigure(e, s, look, a)
      : seatedFigure(e, s, look, a, still);
    return [...deskPieces(e, a, s), figure];
  });
}

/** Bench spots not taken by the lounge agents: idle and finished agents use loungeSpots[0..reserved) first. */
export function freeBenchSpots(room: Room, reserved: number): Pt[] {
  const taken = room.loungeSpots.slice(0, reserved);
  return room.benchSpots.filter((s) => !taken.some((l) => l.x === s.x && l.y === s.y));
}

/** Roster figures waiting on the free lounge spots (static pose, dimmed) and their compact labels. */
export function benchDrawables(c: Ctx, room: Room, plan: BenchPlan, spots: Pt[], ph: DayPhase, dpr: number): { items: Drawable[]; tags: BenchTag[] } {
  const e: Env = { c, t: 0, ph, dpr, night: false };
  const items: Drawable[] = [];
  const tags: BenchTag[] = [];
  const tagAt = (x: number, y: number, name: string, chip: Chip): void =>
    void tags.push({ cx: x * P, top: y * P - BENCH_TAG_H - 2, w: benchTagWidth(name, chip), name, chip });
  plan.figures.forEach((f, i) => {
    const spot = spots[i];
    const look = lookFor({ id: 'bench|' + f.type } as Agent);
    items.push({ z: spot.y + 16, draw: () => alpha(c, 0.62, () => person(e, look, 'lounge', spot.x, spot.y)) });
    tagAt(spot.x, spot.y, f.name, f.chip);
  });
  if (plan.more) tagAt(room.loungeX + 58, room.benchSpots[0].y, '+' + plan.more, null);
  return { items, tags };
}
