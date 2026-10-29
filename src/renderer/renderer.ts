import type { AppState, PermissionRequestInfo } from '../shared/types';
import { CARD_H, CARD_W, drawPermissionCard } from './card';
import type { Hit } from './card';
import { CELL_H, CELL_W, DeskLayout, rowCount } from './scene';
import { FrameGate } from './loop';
import { drawBackground, drawDesk } from './sprites';

interface KayyApi {
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

let state: AppState = { agents: {} };
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

function hasAnimation(): boolean {
  return Object.values(state.agents).some((a) => a.status !== 'idle');
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
    const rows = Math.max(1, Math.min(rowCount(desks), Math.floor((window.innerHeight - cardRoom) / CELL_H)));
    const used = Math.min(w, Math.max(...desks.map((d) => d.x)) + CELL_W);
    ctx.save();
    ctx.translate(Math.round((w - used) / 2), 0);
    drawBackground(ctx, used, rows, new Date().getHours());
    for (const d of desks) if (d.row < rows) drawDesk(ctx, state.agents[d.agentId], d, now);
    ctx.restore();
    panelH = rows * CELL_H;
  }
  if (permissions.length) {
    const req = permissions[0];
    hits = drawPermissionCard(ctx, Math.round((w - CARD_W) / 2), panelH + 10, req, permissions.length - 1, state.agents[req.agentId], hover);
  }
}

function frame(now: number): void {
  if (!visible) { looping = false; return; }
  const animated = hasAnimation();
  if (gate.shouldDraw(now, animated, visible)) draw(now);
  if (animated) requestAnimationFrame(frame);
  else looping = false;
}

function wake(): void {
  if (looping || !visible) return;
  looping = true;
  requestAnimationFrame((t) => { draw(t); frame(t + 1000); });
}

const hitAt = (x: number, y: number): Hit | null =>
  hits.find((h) => x >= h.x - 3 && x <= h.x + h.w + 3 && y >= h.y - 3 && y <= h.y + h.h + 3) ?? null;

window.addEventListener('mousemove', (e) => {
  const h = hitAt(e.clientX, e.clientY);
  const want = h !== null;
  if (want !== interactive) { interactive = want; kayy.setInteractive(want); canvas.style.cursor = want ? 'pointer' : 'default'; }
  if (h?.id !== hover?.id || h?.decision !== hover?.decision) { hover = h; draw(performance.now()); }
});
window.addEventListener('click', (e) => {
  const h = hitAt(e.clientX, e.clientY);
  if (h) kayy.decide(h.id, h.decision);
});

kayy.onState((s) => { state = s; wake(); draw(performance.now()); });
kayy.onPermissions((p) => {
  permissions = p;
  if (!p.length && interactive) { interactive = false; hover = null; kayy.setInteractive(false); }
  draw(performance.now());
});
kayy.onVisibility((v) => { visible = v; if (v) wake(); });
window.addEventListener('resize', () => { resize(); draw(performance.now()); });
resize();
