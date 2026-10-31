// Renderer entry: holds the state from main, draws the office (cached static room + animated layer)
// and wires mouse/IPC events (permission card clicks, title-strip drag, size steps).
import type { Agent, AppState, PermissionRequestInfo } from '../shared/types';
import { t } from '../shared/i18n';
import type { Lang } from '../shared/i18n';
import { agentDrawables, benchDrawables, freeBenchSpots } from './agents';
import type { BenchTag, Drawable } from './agents';
import { benchPlan } from './bench';
import { CARD_H, CARD_W, armDelay, drawPermissionCard } from './card';
import type { Hit } from './card';
import { ClickGuard } from './clickguard';
import { footerParts } from './footer';
import { InteractiveSync } from './interactive';
import { FrameGate, animTime, animationMode } from './loop';
import { askerLabel } from './pill';
import { placePills } from './pillplace';
import { MAX_H, P, roomLayout } from './room';
import type { Room } from './room';
import { FOOTER_H, HEADER_H, paintFrame, paintRoom } from './roomPaint';
import { DeskLayout, officeStats, seatAgents } from './scene';
import type { OfficeStats } from './scene';
import { drawWallLive } from './screens';
import { dayPhase } from './sun';
import type { DayPhase } from './sun';
import { BENCH_TAG_H, FOOTER_FONT, HEADER_FONT, PILL_H, drawBenchTag, drawHint, drawPill, drawText, drawTextRuns, fit, measure, pillWidth } from './text';

interface KayyApi {
  onHint(cb: (text: string | null) => void): void;
  onLanguage(cb: (lang: Lang) => void): void;
  onState(cb: (s: AppState) => void): void;
  onVisibility(cb: (v: boolean) => void): void;
  onPermissions(cb: (p: PermissionRequestInfo[]) => void): void;
  setInteractive(v: boolean): void;
  decide(id: string, decision: 'allow' | 'deny'): void;
  choose(id: string, index: number): void;
  dragStart(): void;
  dragMove(): void;
  dragEnd(): void;
  stepScale(dir: 1 | -1): void;
}
const kayy = (window as unknown as { kayy: KayyApi }).kayy;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const layout = new DeskLayout();
const gate = new FrameGate({ activeFps: 60, idleFps: 10 });
const guard = new ClickGuard();
const sync = new InteractiveSync();

let state: AppState = { agents: {} };
let lang: Lang = 'de';
let hint: string | null = null;
let permissions: PermissionRequestInfo[] = [];
let hits: Hit[] = [];
let hover: Hit | null = null;
let header: { x: number; w: number } | null = null; // the room's title strip (drag handle), in window px
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

// The day phase is re-checked at most once a minute, and only when something redraws anyway.
let phase: DayPhase = dayPhase(clockDate());
let phaseAt = performance.now();
function currentPhase(now: number): DayPhase {
  if (now - phaseAt >= 60_000) { phase = dayPhase(clockDate()); phaseAt = now; }
  return phase;
}

// Static room layer: repainted only when size, day phase, seating or labels change.
const staticCanvas = document.createElement('canvas');
let staticKey = '';

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

const METER_COLOR = { ok: 'rgba(229,231,235,0.8)', warn: '#ffc078', high: '#ff8787' } as const;
const footerRuns = (agents: Agent[]) => footerParts(agents, lang).map((p) => ({ text: p.text, color: METER_COLOR[p.level ?? 'ok'] }));

/** Title strip and footer text, in room coordinates (origin = room's left edge, window top). */
function drawChrome(room: Room, agents: Agent[], st: OfficeStats, overflow: number, dpr: number): void {
  const roomW = room.w * P;
  const raw = t(lang, 'room.stats', { working: st.working, waiting: st.waiting }) + (overflow ? `  ·  ${t(lang, 'room.overflow', { n: overflow })}` : '');
  // right-hand stats get the room width left over after the title, so they never overprint it
  const head = fit(raw, HEADER_FONT, roomW - 52 - measure('KAYY OFFICE', HEADER_FONT), 1);
  drawText(ctx, 'KAYY OFFICE', 42, 13, HEADER_FONT, '#9aa3b5', 'left', dpr);
  drawText(ctx, head, roomW - 10, 13, HEADER_FONT, st.waiting ? '#ffc078' : '#dee2e6', 'right', dpr);
  // drop the last parts when the footer would run past the room edge (narrow rooms)
  const SEP = '  ·  ';
  const widthOf = (rs: Array<{ text: string }>) => rs.reduce((n, r) => n + measure(r.text, FOOTER_FONT), 0) + measure(SEP, FOOTER_FONT) * (rs.length - 1);
  let runs = footerRuns(agents);
  while (runs.length > 1 && widthOf(runs) > roomW - 16) runs = runs.slice(0, -1);
  drawTextRuns(ctx, runs, roomW / 2, HEADER_H + room.h * P + 14, FOOTER_FONT, 'rgba(229,231,235,0.5)', dpr);
}

/** Name pills and bench tags, nudged apart so crowded spots stay readable. */
function drawLabels(items: Drawable[], tags: BenchTag[], room: Room, dpr: number): void {
  const pills = items.flatMap((d) => (d.pill ? [d.pill] : []));
  const spots = placePills(
    [...pills.map((q) => ({ cx: q.x * P, top: q.top, w: pillWidth(q.agent, lang), h: PILL_H })), ...tags.map((q) => ({ cx: q.cx, top: q.top, w: q.w, h: BENCH_TAG_H }))],
    { left: 0, right: room.w * P, top: 0, bottom: room.h * P + FOOTER_H / 2 },
  );
  pills.forEach((q, i) => drawPill(ctx, q.agent, spots[i].x, spots[i].top, dpr, lang));
  tags.forEach((q, i) => drawBenchTag(ctx, q.name, q.chip, spots[pills.length + i].x, spots[pills.length + i].top, dpr));
}

/** The framed office; returns the panel height (the permission card goes below it). */
function drawOffice(now: number, agents: Agent[], w: number, dpr: number): number {
  const desks = layout.layout(agents);
  const cardRoom = permissions.length ? CARD_H + 14 : 0;
  const maxH = Math.min(MAX_H, Math.floor((window.innerHeight - HEADER_H - FOOTER_H - cardRoom) / P));
  const room = roomLayout(Math.max(0, ...desks.map((d) => d.slot)) + 1, Math.floor((w - 8) / P), maxH);
  const ph = currentPhase(now);
  const { seated, labels, overflow } = seatAgents(desks, state.agents, room);
  ensureStatic(room, ph, new Set(seated.map((x) => x.s.slot)), labels, dpr);

  const ox = Math.round((w - room.w * P) / 2);
  header = { x: ox, w: room.w * P };
  ctx.drawImage(staticCanvas, Math.round(ox * dpr), 0);

  // whole device pixels: both layers must stay aligned at fractional dpr
  const ox_dev = Math.round(ox * dpr), header_dev = Math.round(HEADER_H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, ox_dev, 0);
  const st = officeStats(agents);
  drawChrome(room, agents, st, overflow, dpr);

  ctx.setTransform(dpr, 0, 0, dpr, ox_dev, header_dev);
  drawWallLive(ctx, room, clockDate(), st, lang, dpr);
  // idle and finished agents sit on the lounge spots first; roster figures get what is left
  const spots = freeBenchSpots(room, agents.filter((a) => a.status === 'idle' || a.status === 'done').length);
  const bench = benchDrawables(ctx, room, benchPlan(state.roster, agents, spots.length), spots, ph, dpr);
  const items = [...agentDrawables(ctx, room, seated, animTime(now, reduced), ph, dpr, reduced), ...bench.items].sort((a, b) => a.z - b.z);
  for (const d of items) d.draw();
  drawLabels(items, bench.tags, room, dpr);
  return HEADER_H + room.h * P + FOOTER_H;
}

function draw(now: number): void {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  hits = [];
  header = null;
  const agents = Object.values(state.agents);
  let panelH = 0;
  panelH = drawOffice(now, agents, w, dpr); // the empty room is shown too (0 agents)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!agents.length && hint) drawHint(ctx, w, hint);
  if (permissions.length) {
    const req = permissions[0];
    const y = Math.min(panelH + 10, window.innerHeight - CARD_H - 4);
    const asker = askerLabel(state.agents[req.agentId], req.agentId, agents, lang);
    hits = drawPermissionCard(ctx, Math.round((w - CARD_W) / 2), y, req, permissions.length - 1, asker, lang, hover);
  }
}

const redraw = (): void => safeDraw(performance.now());
function safeDraw(now: number): void {
  try { draw(now); } catch (e) { console.error('draw failed', e); }
}

// fast = 60 fps rAF, slow = 10 fps timer, none = the last frame stays
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

const overHeader = (x: number, y: number): boolean =>
  header !== null && y >= 0 && y < HEADER_H && x >= header.x && x <= header.x + header.w;

// Dragging the title strip moves the window: main follows the real cursor (exact at any page zoom),
// clamps it to the displays and remembers the spot.
let drag = false;
function endDrag(): void {
  if (!drag) return;
  drag = false;
  kayy.dragEnd();
}

window.addEventListener('mousemove', (e) => {
  if (drag && e.buttons === 0) endDrag(); // the button was released outside the window
  if (drag) { kayy.dragMove(); return; }
  const h = hitAt(e.clientX, e.clientY);
  const grab = h === null && overHeader(e.clientX, e.clientY);
  const want = h !== null || grab;
  if (sync.want(want)) kayy.setInteractive(want);
  canvas.style.cursor = grab ? 'move' : h ? 'pointer' : 'default';
  if (h?.id !== hover?.id || h?.decision !== hover?.decision || h?.choice !== hover?.choice) { hover = h; draw(performance.now()); }
});
window.addEventListener('mousedown', (e) => {
  const h = hitAt(e.clientX, e.clientY);
  if (h === null && e.button === 0 && overHeader(e.clientX, e.clientY)) { drag = true; kayy.dragStart(); return; }
  guard.down(h, performance.now());
});
window.addEventListener('mouseup', (e) => {
  if (drag) { endDrag(); return; }
  const h = guard.up(hitAt(e.clientX, e.clientY), performance.now());
  if (h?.decision === 'choice' && h.choice !== undefined) kayy.choose(h.id, h.choice);
  else if (h && h.decision !== 'choice') kayy.decide(h.id, h.decision);
});

// Ctrl + wheel over the title strip: one size step per notch (throttled, each step resizes the window)
let lastStep = 0;
window.addEventListener('wheel', (e) => {
  if (!e.ctrlKey || !overHeader(e.clientX, e.clientY)) return;
  e.preventDefault();
  const now = performance.now();
  if (e.deltaY === 0 || now - lastStep < 150) return;
  lastStep = now;
  kayy.stepScale(e.deltaY < 0 ? 1 : -1);
}, { passive: false });

kayy.onState((s) => { state = s; wake(); redraw(); });
kayy.onPermissions((p) => {
  permissions = p;
  guard.show(p[0]?.id ?? null, performance.now(), p[0] ? armDelay(p[0]) : undefined);
  if (!p.length && sync.active) { sync.reset(); hover = null; kayy.setInteractive(false); }
  redraw();
});
kayy.onHint((text) => { hint = text; redraw(); });
kayy.onLanguage((l) => { lang = l; wake(); redraw(); });
motionQuery.addEventListener('change', (e) => { reduced = e.matches; wake(); redraw(); });
kayy.onVisibility((v) => {
  visible = v;
  if (!v) { sync.reset(); hover = null; drag = false; } // main resets click-through on hide; forget our belief too
  else wake();
});
window.addEventListener('resize', () => { resize(); staticKey = ''; draw(performance.now()); });

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}
resize();
