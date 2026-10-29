import type { Agent, AppState, PermissionRequestInfo } from '../shared/types';
import { CARD_H, CARD_W, armDelay, drawPermissionCard } from './card';
import type { Hit } from './card';
import { CELL_H, CELL_W, DeskLayout, officeStats, rowCount } from './scene';
import type { Desk } from './scene';
import { ClickGuard } from './clickguard';
import { FrameGate, animationMode } from './loop';
import { formatCost } from '../shared/model';
import { projectOf } from '../shared/project';
import { drawBackground, drawDesk, drawFooter, drawHint, drawPlate } from './sprites';

const FOOTER_H = 22;

interface KayyApi {
  onHint(cb: (text: string | null) => void): void;
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
let hint: string | null = null;
let permissions: PermissionRequestInfo[] = [];
let hits: Hit[] = [];
let hover: Hit | null = null;
let interactive = false;
let visible = true;
let looping = false;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}

function footerText(agents: Agent[]): string {
  const s = officeStats(agents);
  const parts = [`${s.total} Agent${s.total === 1 ? '' : 's'}`];
  if (s.working) parts.push(`${s.working} aktiv`);
  if (s.waiting) parts.push(`${s.waiting} wartet auf dich`);
  if (s.costUsd !== null) parts.push(formatCost(s.costUsd));
  return parts.join('  ·  ');
}

/** Consecutive desks of one project on one row form a "room". */
function projectRuns(desks: Desk[]): Array<{ x: number; y: number; w: number; name: string }> {
  const runs: Array<{ x: number; y: number; w: number; name: string; row: number; last: number }> = [];
  for (const d of desks) {
    const name = projectOf(state.agents[d.agentId]);
    const cur = runs[runs.length - 1];
    if (cur && cur.name === name && cur.row === d.row && cur.last + 1 === d.slot) { cur.w += CELL_W; cur.last = d.slot; }
    else runs.push({ x: d.x, y: d.y, w: CELL_W, name, row: d.row, last: d.slot });
  }
  return runs;
}

function draw(now: number): void {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, window.innerHeight);
  hits = [];
  const agents = Object.values(state.agents);
  const cardRoom = permissions.length ? CARD_H + 16 : 0;
  let panelH = 0;
  if (agents.length) {
    const desks = layout.layout(agents, w);
    const rows = Math.max(1, Math.min(rowCount(desks), Math.floor((window.innerHeight - cardRoom - FOOTER_H) / CELL_H)));
    const used = Math.min(w, Math.max(...desks.map((d) => d.x)) + CELL_W);
    ctx.save();
    ctx.translate(Math.round((w - used) / 2), 0);
    drawBackground(ctx, used, rows, new Date().getHours(), FOOTER_H);
    const visibleDesks = desks.filter((d) => d.row < rows).sort((a, b) => a.slot - b.slot);
    for (const run of projectRuns(visibleDesks)) drawPlate(ctx, run.x, run.y, run.w, run.name);
    for (const d of visibleDesks) { const a = state.agents[d.agentId]; drawDesk(ctx, a, d, now, a.color); }
    drawFooter(ctx, used, rows * CELL_H, footerText(agents));
    ctx.restore();
    panelH = rows * CELL_H + FOOTER_H;
  } else if (hint) {
    drawHint(ctx, w, hint);
  }
  if (permissions.length) {
    const req = permissions[0];
    hits = drawPermissionCard(ctx, Math.round((w - CARD_W) / 2), panelH + 10, req, permissions.length - 1, state.agents[req.agentId], hover);
  }
}

function safeDraw(now: number): void {
  try { draw(now); } catch (e) { console.error('draw failed', e); }
}

function frame(now: number): void {
  if (!visible) { looping = false; return; }
  const mode = animationMode(Object.values(state.agents));
  if (gate.shouldDraw(now, mode === 'fast', visible)) safeDraw(now);
  if (mode === 'fast') requestAnimationFrame(frame);
  else if (mode === 'slow') setTimeout(() => frame(performance.now()), 100);
  else looping = false;
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
kayy.onHint((t) => { hint = t; safeDraw(performance.now()); });
kayy.onVisibility((v) => { visible = v; if (v) wake(); });
window.addEventListener('resize', () => { resize(); draw(performance.now()); });
resize();
