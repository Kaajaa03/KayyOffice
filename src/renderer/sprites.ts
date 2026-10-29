import type { Agent } from '../shared/types';
import { CELL_H, CELL_W } from './scene';
import type { Desk } from './scene';

const U = 3; // one logical pixel = 3 css px
const PALETTE = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#9775fa', '#f783ac'];

export function agentColor(id: string, override?: string): string {
  if (override) return override;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

type Ctx = CanvasRenderingContext2D;
const r = (c: Ctx, x: number, y: number, w: number, h: number, color: string) => {
  c.fillStyle = color;
  c.fillRect(Math.round(x * U), Math.round(y * U), w * U, h * U);
};

export function drawBackground(c: Ctx, w: number, rows: number, hour: number): void {
  const h = rows * CELL_H;
  const night = hour < 5 || hour >= 21;
  const dusk = (hour >= 5 && hour < 7) || (hour >= 18 && hour < 21);
  const [top, bottom] = night ? ['#0f1422', '#161d30'] : dusk ? ['#34294f', '#241e3b'] : ['#2c3d5c', '#202c45'];
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(0, -20, w, h + 20, [0, 0, 18, 18]);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.08)';
  c.lineWidth = 1;
  c.stroke();
}

/** Project nameplate above a run of desks that belong to the same project. */
export function drawPlate(c: Ctx, x: number, y: number, w: number, name: string): void {
  c.save();
  c.fillStyle = 'rgba(255,255,255,0.05)';
  c.beginPath();
  c.roundRect(x + 3, y + 3, w - 6, CELL_H - 8, 10);
  c.fill();
  c.font = '700 10px ui-monospace, Consolas, monospace';
  c.textAlign = 'left';
  c.fillStyle = 'rgba(229,231,235,0.55)';
  c.fillText(('▸ ' + name).slice(0, Math.max(4, Math.floor((w - 16) / 6.2))), x + 10, y + 15);
  c.restore();
}

function screen(c: Ctx, agent: Agent, t: number): void {
  const sx = 10, sy = 20; // 16x6 units
  switch (agent.status) {
    case 'working': {
      r(c, sx, sy, 16, 6, '#0d1117');
      const cat = agent.category ?? 'other';
      if (cat === 'code') {
        const cols = ['#69db7c', '#4dabf7', '#ffd43b'];
        for (let i = 0; i < 3; i++) {
          const w = 4 + Math.floor(((Math.sin(t / 220 + i * 2) + 1) / 2) * 9);
          r(c, sx + 1, sy + 1 + i * 2, w, 1, cols[i]);
        }
      } else if (cat === 'terminal') {
        r(c, sx + 1, sy + 1, 2, 1, '#69db7c');
        r(c, sx + 4, sy + 1, 6, 1, '#8b949e');
        if (Math.floor(t / 400) % 2 === 0) r(c, sx + 1, sy + 3, 2, 2, '#69db7c');
      } else if (cat === 'browser') {
        r(c, sx, sy, 16, 1, '#4dabf7');
        r(c, sx + 1, sy + 2, 6, 3, '#8b949e');
        r(c, sx + 8, sy + 2, 7, 3, '#4b5563');
      } else {
        for (let i = 0; i < 3; i++) r(c, sx + 4 + i * 3, sy + 2, 2, 2, Math.floor(t / 250) % 3 === i ? '#ffffff' : '#4b5563');
      }
      break;
    }
    case 'error':
      r(c, sx, sy, 16, 6, Math.floor(t / 300) % 2 ? '#7f1d1d' : '#dc2626');
      r(c, sx + 6, sy + 1, 4, 4, '#fee2e2');
      break;
    case 'waiting':
      r(c, sx, sy, 16, 6, '#3b2f0d');
      r(c, sx + 7, sy + 1, 2, 3, '#ffd43b');
      r(c, sx + 7, sy + 5, 2, 1, '#ffd43b');
      break;
    default:
      r(c, sx, sy, 16, 6, '#151b27');
  }
}

export function labelFor(a: Agent): string {
  if (a.role) return a.role;
  if (a.parentId) return 'sub-agent';
  const parts = a.cwd.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? a.id.slice(0, 6);
}

const STATUS_TEXT: Record<string, string> = {
  working: 'working', waiting: 'needs you', done: 'done', error: 'error', idle: 'idle',
};

/** Canvas state is always restored, even if a draw call throws. */
export function drawDesk(c: Ctx, agent: Agent, desk: Desk, t: number, colorOverride?: string): void {
  c.save();
  try { drawDeskBody(c, agent, desk, t, colorOverride); } finally { c.restore(); }
}

function drawDeskBody(c: Ctx, agent: Agent, desk: Desk, t: number, colorOverride?: string): void {
  const color = agentColor(agent.id, colorOverride);
  c.translate(desk.x, desk.y);
  const standing = agent.status === 'waiting';

  if (standing) {
    const glow = c.createRadialGradient(CELL_W / 2, 75, 4, CELL_W / 2, 75, 62);
    const a = 0.22 + 0.14 * Math.sin(t / 250);
    glow.addColorStop(0, color + Math.round(a * 255).toString(16).padStart(2, '0'));
    glow.addColorStop(1, color + '00');
    c.fillStyle = glow;
    c.fillRect(0, 0, CELL_W, CELL_H);
  }

  r(c, 0, 38, 36, 5, 'rgba(0,0,0,0.18)'); // floor strip
  r(c, 12, 15, 12, 13, '#2c3345'); // chair back
  const oy = standing ? -5 : 0;
  r(c, 15, 12 + oy, 6, 6, '#f1c27d'); // head
  r(c, 15, 11 + oy, 6, 2, color); // hair
  r(c, 13, 18 + oy, 10, 8, color); // body
  if (standing) {
    r(c, 14, 26 + oy, 3, 5, '#1f2937');
    r(c, 19, 26 + oy, 3, 5, '#1f2937');
    const bounce = Math.floor(t / 350) % 2;
    r(c, 22, 2 + bounce, 8, 9, '#ffffff'); // speech bubble
    r(c, 25, 4 + bounce, 2, 4, '#dc2626');
    r(c, 25, 9 + bounce, 2, 1, '#dc2626');
  }
  // monitor
  r(c, 17, 25, 2, 2, '#4b5563');
  r(c, 9, 19, 18, 8, '#1f2937');
  screen(c, agent, t);
  // desk
  r(c, 3, 27, 30, 3, '#7a5a3c');
  r(c, 3, 30, 30, 8, '#5e4530');
  r(c, 4, 38, 2, 3, '#3d2d1f');
  r(c, 30, 38, 2, 3, '#3d2d1f');
  if (agent.status === 'working') {
    const up = Math.floor(t / 130) % 2;
    r(c, 13, 26 - up, 3, 2, '#f1c27d');
    r(c, 20, 25 + up, 3, 2, '#f1c27d');
  }
  if (agent.status === 'done') {
    r(c, 27, 23, 4, 4, '#f8fafc'); // cup
    r(c, 31, 24, 1, 2, '#f8fafc');
    const s = Math.floor(t / 300) % 3;
    r(c, 28, 21 - s, 1, 1, 'rgba(255,255,255,0.7)');
    r(c, 30, 20 - ((s + 1) % 3), 1, 1, 'rgba(255,255,255,0.5)');
  }

  // label
  c.font = '600 11px ui-monospace, Consolas, monospace';
  c.textAlign = 'center';
  c.fillStyle = '#e5e7eb';
  c.fillText(labelFor(agent).slice(0, 14), CELL_W / 2, 41 * U + 4);
  c.fillStyle = color;
  c.font = '10px ui-monospace, Consolas, monospace';
  c.fillText(STATUS_TEXT[agent.status], CELL_W / 2, 41 * U + 17);
}
