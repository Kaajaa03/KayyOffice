import type { AppState } from '../shared/types';
import { DeskLayout, rowCount } from './scene';
import { FrameGate } from './loop';
import { drawBackground, drawDesk } from './sprites';
import { CELL_H } from './scene';

interface KayyApi {
  onState(cb: (s: AppState) => void): void;
  onVisibility(cb: (v: boolean) => void): void;
}
const kayy = (window as unknown as { kayy: KayyApi }).kayy;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const layout = new DeskLayout();
const gate = new FrameGate({ activeFps: 60, idleFps: 10 });

let state: AppState = { agents: {} };
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
  const agents = Object.values(state.agents);
  if (!agents.length) return;
  const desks = layout.layout(agents, w);
  const rows = Math.min(rowCount(desks), Math.floor(window.innerHeight / CELL_H));
  const used = Math.max(1, Math.min(w, Math.max(...desks.map((d) => d.x)) + 108));
  const offset = Math.round((w - used) / 2);
  ctx.save();
  ctx.translate(offset, 0);
  drawBackground(ctx, used, rows, new Date().getHours());
  for (const d of desks) {
    const a = state.agents[d.agentId];
    if (d.row < rows) drawDesk(ctx, a, d, now);
  }
  ctx.restore();
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

kayy.onState((s) => { state = s; wake(); draw(performance.now()); });
kayy.onVisibility((v) => { visible = v; if (v) wake(); });
window.addEventListener('resize', () => { resize(); draw(performance.now()); });
resize();
