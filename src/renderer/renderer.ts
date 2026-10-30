import type { Agent, AppState, PermissionRequestInfo } from '../shared/types';
import { CARD_H, CARD_W, armDelay, drawPermissionCard } from './card';
import type { Hit } from './card';
import { DeskLayout, officeStats } from './scene';
import { ClickGuard } from './clickguard';
import { FrameGate, animTime, animationMode } from './loop';
import { t } from '../shared/i18n';
import type { Lang } from '../shared/i18n';
import { askerLabel } from './pill';
import { placePills } from './pillplace';
import { formatCost } from '../shared/model';
import { projectOf } from '../shared/project';
import { MAX_H, P, roomLayout } from './room';
import type { Pt, Room, Seat } from './room';
import { dayPhase } from './sun';
import type { DayPhase } from './sun';
import { doneTimeline, pointAlong, walkPath } from './walk';
import {
  CLOCK_Y, DISPLAY_Y, FOOTER_FONT, FOOTER_H, HEADER_FONT, HEADER_H, PILL_H, SMALL_FONT,
  blit, bottomChairY, chairBackSprite, drawClockHands, drawHint, drawPill, drawScreen, drawText,
  glowSprite, lookFor, monitorBackSprite, monitorBackY, monitorFrontY, paintFrame, paintRoom,
  personSprite, pillWidth, r, wallItems,
} from './sprites';
import type { Pose } from './sprites';

interface KayyApi {
  onHint(cb: (text: string | null) => void): void;
  onLanguage(cb: (lang: Lang) => void): void;
  onState(cb: (s: AppState) => void): void;
  onVisibility(cb: (v: boolean) => void): void;
  onPermissions(cb: (p: PermissionRequestInfo[]) => void): void;
  setInteractive(v: boolean): void;
  decide(id: string, decision: 'allow' | 'deny'): void;
}
const kayy = (window as unknown as { kayy: KayyApi }).kayy;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const layout = new DeskLayout();
const gate = new FrameGate({ activeFps: 60, idleFps: 10 });
const guard = new ClickGuard();

let state: AppState = { agents: {} };
let lang: Lang = 'de';
let hint: string | null = null;
let permissions: PermissionRequestInfo[] = [];
let hits: Hit[] = [];
let hover: Hit | null = null;
let interactive = false;
let visible = true;
let looping = false;

// prefers-reduced-motion: no bobbing/steam/blinking, characters switch pose, walking is an instant relocation
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionQuery.matches;

// Debug: `--hour=<0-23>` (passed as ?hour= by the main process) simulates the time of day.
const hourParam = new URLSearchParams(location.search).get('hour');
const hourOverride = hourParam !== null && /^\d{1,2}$/.test(hourParam) ? Number(hourParam) % 24 : null;
const clockDate = (): Date => {
  const d = new Date();
  if (hourOverride !== null) d.setHours(hourOverride);
  return d;
};

// Day phase is re-checked at most once a minute, and only when something redraws anyway.
let phase: DayPhase = dayPhase(clockDate());
let phaseAt = performance.now();
function currentPhase(now: number): DayPhase {
  if (now - phaseAt >= 60_000) { phase = dayPhase(clockDate()); phaseAt = now; }
  return phase;
}

// Static room layer: repainted only when size, day phase or seating changes.
const staticCanvas = document.createElement('canvas');
let staticKey = '';

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}

function footerText(agents: Agent[]): string {
  const s = officeStats(agents);
  const parts = [t(lang, s.total === 1 ? 'footer.agents.one' : 'footer.agents.other', { n: s.total })];
  if (s.working) parts.push(t(lang, 'footer.active', { n: s.working }));
  if (s.waiting) parts.push(t(lang, 'footer.waiting', { n: s.waiting }));
  if (s.costUsd !== null) parts.push(formatCost(s.costUsd));
  return parts.join('  ·  ');
}

function ensureStatic(room: Room, ph: DayPhase, occupied: Set<number>, labels: string[], dpr: number): void {
  const key = `${room.w}x${room.h}|${dpr}|${ph}|${[...occupied].sort((a, b) => a - b).join(',')}|${labels.join('/')}`;
  if (key === staticKey) return;
  staticKey = key;
  const w = room.w * P, h = HEADER_H + room.h * P + FOOTER_H;
  staticCanvas.width = Math.ceil(w * dpr);
  staticCanvas.height = Math.ceil(h * dpr);
  const c = staticCanvas.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintFrame(c, w, room.h * P);
  c.translate(0, HEADER_H);
  paintRoom(c, room, ph, occupied, labels);
}

interface Drawable { z: number; draw: () => void; pill?: { x: number; top: number; agent: Agent } }

const walkPose = (dir: string, frame: 0 | 1): Pose =>
  dir === 'up' ? (frame ? 'back1' : 'back0') : dir === 'right' ? (frame ? 'sideR1' : 'sideR0') : dir === 'left' ? (frame ? 'sideL1' : 'sideL0') : (frame ? 'walk1' : 'walk0');

/** Person, chair, monitor and effects of every seated agent, to be drawn in z order. */
function agentDrawables(c: CanvasRenderingContext2D, room: Room, seated: Array<{ a: Agent; s: Seat }>, t: number, ph: DayPhase, dpr: number, still: boolean): Drawable[] {
  const out: Drawable[] = [];
  const wall = Date.now();
  const night = ph === 'night' || ph === 'dusk';
  const timeline = new Map(seated.filter(({ a }) => a.status === 'done').map(({ a }) => [a.id, doneTimeline(wall - a.lastEventTs, still)]));
  const coffeeIdx = new Map<string, number>(), loungeIdx = new Map<string, number>();
  for (const { a } of seated) {
    const tl = timeline.get(a.id);
    if (!tl) continue;
    if (tl.phase === 'toCoffee' || tl.phase === 'coffee') coffeeIdx.set(a.id, coffeeIdx.size);
    else loungeIdx.set(a.id, loungeIdx.size);
  }

  for (const { a, s } of seated) {
    const look = lookFor(a);
    const up = s.facing === 'up';
    const screenOn = a.status === 'working' || a.status === 'error' || a.status === 'waiting';
    if (up) {
      const my = monitorFrontY(s);
      out.push({ z: s.y - 1, draw: () => {
        if (night && screenOn) { c.globalAlpha = 0.55; blit(c, glowSprite('rgba(140,190,255,0.9)', 14, dpr), s.x - 14, my - 9, dpr); c.globalAlpha = 1; }
        drawScreen(c, a, s.x, my, t);
      } });
      out.push({ z: s.y + 15, draw: () => blit(c, chairBackSprite(dpr, ph), s.x - 6, bottomChairY(s), dpr) });
    } else {
      const my = monitorBackY(s);
      out.push({ z: s.y + 10, draw: () => {
        blit(c, monitorBackSprite(dpr, ph), s.x - 7, my, dpr);
        const led = a.status === 'working' ? '#51cf66' : a.status === 'error' ? (Math.floor(t / 300) % 2 ? '#ff6b6b' : '#7f1d1d') : a.status === 'waiting' ? '#ffa94d' : '#6c7380';
        r(c, s.x + 5, my + 7, 1, 1, led);
      } });
    }

    const stand: Pt = up ? { x: s.x, y: s.y - 1 } : { x: s.x, y: s.y - 5 };
    if (a.status === 'done') {
      const tl = timeline.get(a.id)!;
      const ci = coffeeIdx.get(a.id) ?? 0;
      const coffee = { x: room.coffee.x + ci * 9, y: room.coffee.y + (ci % 2) * 2 };
      const spot = room.loungeSpots[(loungeIdx.get(a.id) ?? 0) % room.loungeSpots.length];
      let pos: Pt, pose: Pose, steam = false;
      if (tl.phase === 'toCoffee') {
        const w = pointAlong(walkPath(stand, coffee, s.aisleY), tl.t);
        pos = w; pose = walkPose(w.dir, w.frame);
      } else if (tl.phase === 'coffee') {
        pos = coffee; pose = 'cup'; steam = !still;
      } else if (tl.phase === 'toLounge') {
        const w = pointAlong(walkPath(coffee, spot, room.wallAisleY), tl.t);
        pos = w; pose = walkPose(w.dir, w.frame);
      } else {
        pos = spot; pose = 'lounge'; steam = !still;
      }
      const p = pos;
      out.push({
        z: p.y + 16,
        draw: () => {
          blit(c, personSprite(look, pose, dpr, ph), p.x - 4, p.y, dpr);
          if (steam) {
            const k = Math.floor(t / 300) % 3;
            const cx = pose === 'cup' ? p.x + 3 : p.x;
            c.globalAlpha = 0.75;
            r(c, cx, p.y + 6 - k, 1, 1, '#ffffff');
            r(c, cx + 1, p.y + 5 - ((k + 1) % 3), 1, 1, '#ffffff');
            c.globalAlpha = 1;
          }
        },
        pill: { x: p.x, top: p.y * P - PILL_H - 2, agent: a },
      });
      continue;
    }

    if (a.status === 'waiting') {
      const bob = Math.floor(t / 350) % 2;
      const p = { x: s.x + (up ? 11 : -11), y: stand.y - bob };
      out.push({
        z: stand.y + 16,
        draw: () => {
          c.globalAlpha = 0.45 + 0.25 * Math.sin(t / 250);
          blit(c, glowSprite('rgba(255,169,77,0.85)', 16, dpr), p.x - 16, p.y - 6, dpr);
          c.globalAlpha = 1;
          blit(c, personSprite(look, 'stand', dpr, ph), p.x - 4, p.y, dpr);
          r(c, p.x + 5, p.y - 6, 7, 7, '#ffffff');
          r(c, p.x + 5, p.y + 1, 2, 1, '#ffffff');
          r(c, p.x + 8, p.y - 5, 1, 3, '#e03131');
          r(c, p.x + 8, p.y - 1, 1, 1, '#e03131');
        },
        pill: { x: p.x, top: (p.y - 7) * P - PILL_H, agent: a },
      });
      continue;
    }

    const typing = a.status === 'working' ? (still ? 1 : Math.floor(t / 130) % 2) : 0;
    const pose: Pose = up ? (typing ? 'seatBack1' : 'seatBack0') : 'seatFront';
    out.push({
      z: up ? s.y + 14 : s.y + 9,
      draw: () => {
        blit(c, personSprite(look, pose, dpr, ph), s.x - 4, s.y, dpr);
        if (!up && night && screenOn) { c.globalAlpha = 0.5; blit(c, glowSprite('rgba(150,200,255,0.9)', 7, dpr), s.x - 7, s.y - 2, dpr); c.globalAlpha = 1; }
        if (a.status === 'error') {
          const blink = Math.floor(t / 300) % 2;
          r(c, s.x + 5, s.y + 1 + blink, 1, 2, '#74c0fc');
          r(c, s.x - 1, s.y - 5, 2, 3, blink ? '#e03131' : '#ff8787');
          r(c, s.x - 1, s.y - 1, 2, 1, blink ? '#e03131' : '#ff8787');
        }
      },
      pill: up
        ? { x: s.x, top: (bottomChairY(s) + 8) * P + 1, agent: a }
        : { x: s.x, top: s.y * P - PILL_H - 2, agent: a },
    });
  }
  return out;
}

function draw(now: number): void {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  hits = [];
  const agents = Object.values(state.agents);
  let panelH = 0;
  if (agents.length) {
    const desks = layout.layout(agents);
    const maxSlot = Math.max(...desks.map((d) => d.slot));
    const cardRoom = permissions.length ? CARD_H + 14 : 0;
    const room = roomLayout(maxSlot + 1, Math.floor((w - 8) / P), Math.min(MAX_H, Math.floor((window.innerHeight - HEADER_H - FOOTER_H - cardRoom) / P)));
    const ph = currentPhase(now);
    const seated: Array<{ a: Agent; s: Seat }> = [];
    const clusterProjects: string[][] = room.clusters.map(() => []);
    let overflow = 0;
    for (const d of desks.sort((x, y) => x.slot - y.slot)) {
      const s = room.seats[d.slot];
      const a = state.agents[d.agentId];
      if (!s) { overflow++; continue; }
      seated.push({ a, s });
      const name = projectOf(a);
      if (!clusterProjects[s.cluster].includes(name)) clusterProjects[s.cluster].push(name);
    }
    ensureStatic(room, ph, new Set(seated.map((x) => x.s.slot)), clusterProjects.map((p) => p.join(' · ')), dpr);

    const ox = Math.round((w - room.w * P) / 2);
    const roomH = room.h * P;
    ctx.drawImage(staticCanvas, Math.round(ox * dpr), 0);

    // header + footer text
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, 0);
    const st = officeStats(agents);
    drawText(ctx, 'KAYY OFFICE', 42, 13, HEADER_FONT, '#9aa3b5', 'left', dpr);
    const head = t(lang, 'room.stats', { working: st.working, waiting: st.waiting }) + (overflow ? `  ·  ${t(lang, 'room.overflow', { n: overflow })}` : '');
    drawText(ctx, head, room.w * P - 10, 13, HEADER_FONT, st.waiting ? '#ffc078' : '#dee2e6', 'right', dpr);
    drawText(ctx, footerText(agents), (room.w * P) / 2, HEADER_H + roomH + 14, FOOTER_FONT, 'rgba(229,231,235,0.8)', 'center', dpr);

    // room content
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, HEADER_H * dpr);
    const date = clockDate();
    for (const it of wallItems(room)) {
      if (it.kind === 'clock') drawClockHands(ctx, it.x + 6, CLOCK_Y, date);
      if (it.kind === 'display') {
        drawText(ctx, t(lang, 'room.displayWorking', { n: st.working }), (it.x + 3) * P, (DISPLAY_Y + 6) * P + 1, SMALL_FONT, '#69db7c', 'left', dpr);
        drawText(ctx, t(lang, 'room.displayWaiting', { n: st.waiting }), (it.x + 3) * P, (DISPLAY_Y + 12) * P, SMALL_FONT, st.waiting ? '#ffa94d' : '#74c0fc', 'left', dpr);
      }
    }
    const items = agentDrawables(ctx, room, seated, animTime(now, reduced), ph, dpr, reduced).sort((a, b) => a.z - b.z);
    for (const d of items) d.draw();
    const pills = items.filter((d) => d.pill).map((d) => d.pill!);
    const spots = placePills(
      pills.map((q) => ({ cx: q.x * P, top: q.top, w: pillWidth(q.agent, lang), h: PILL_H })),
      { left: 0, right: room.w * P, top: 0, bottom: roomH + FOOTER_H / 2 },
    );
    pills.forEach((q, i) => drawPill(ctx, q.agent, spots[i].x, spots[i].top, dpr, lang));
    panelH = HEADER_H + roomH + FOOTER_H;
  } else if (hint) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawHint(ctx, w, hint);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (permissions.length) {
    const req = permissions[0];
    const y = Math.min(panelH + 10, window.innerHeight - CARD_H - 4);
    const asker = askerLabel(state.agents[req.agentId], req.agentId, agents, lang);
    hits = drawPermissionCard(ctx, Math.round((w - CARD_W) / 2), y, req, permissions.length - 1, asker, lang, hover);
  }
}

function safeDraw(now: number): void {
  try { draw(now); } catch (e) { console.error('draw failed', e); }
}

function frame(now: number): void {
  if (!visible) { looping = false; return; }
  const mode = animationMode(Object.values(state.agents), Date.now(), reduced);
  if (gate.shouldDraw(now, mode === 'fast', visible)) safeDraw(now);
  if (mode === 'fast') requestAnimationFrame(frame);
  else if (mode === 'slow') setTimeout(() => frame(performance.now()), 100);
  else { looping = false; safeDraw(now); } // final still frame (e.g. walker arrived)
}

function wake(): void {
  if (looping || !visible) return;
  looping = true;
  requestAnimationFrame(frame);
}

const hitAt = (x: number, y: number): Hit | null =>
  hits.find((h) => x >= h.x - 3 && x <= h.x + h.w + 3 && y >= h.y - 3 && y <= h.y + h.h + 3) ?? null;

window.addEventListener('mousemove', (e) => {
  const h = hitAt(e.clientX, e.clientY);
  const want = h !== null;
  if (want !== interactive) { interactive = want; kayy.setInteractive(want); canvas.style.cursor = want ? 'pointer' : 'default'; }
  if (h?.id !== hover?.id || h?.decision !== hover?.decision) { hover = h; draw(performance.now()); }
});
window.addEventListener('mousedown', (e) => guard.down(hitAt(e.clientX, e.clientY), performance.now()));
window.addEventListener('mouseup', (e) => {
  const h = guard.up(hitAt(e.clientX, e.clientY), performance.now());
  if (h) kayy.decide(h.id, h.decision);
});

kayy.onState((s) => { state = s; wake(); safeDraw(performance.now()); });
kayy.onPermissions((p) => {
  permissions = p;
  guard.show(p[0]?.id ?? null, performance.now(), p[0] ? armDelay(p[0]) : undefined);
  if (!p.length && interactive) { interactive = false; hover = null; kayy.setInteractive(false); }
  safeDraw(performance.now());
});
kayy.onHint((text) => { hint = text; safeDraw(performance.now()); });
kayy.onLanguage((l) => { lang = l; wake(); safeDraw(performance.now()); });
motionQuery.addEventListener('change', (e) => { reduced = e.matches; wake(); safeDraw(performance.now()); });
kayy.onVisibility((v) => { visible = v; if (v) wake(); });
window.addEventListener('resize', () => { resize(); staticKey = ''; draw(performance.now()); });
resize();
