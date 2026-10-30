// Live pixels on screens: monitor content per agent status, clock hands and the wall display counters.
import { t } from '../shared/i18n';
import type { Lang } from '../shared/i18n';
import type { Agent } from '../shared/types';
import { r, tick } from './pixels';
import type { Ctx } from './pixels';
import { P } from './room';
import type { Room } from './room';
import { wallItems } from './roomPaint';
import { drawText, SMALL_FONT } from './text';
import { CLOCK_Y, DISPLAY_Y } from './zones';

type Px = (dx: number, dy: number, w: number, h: number, color: string) => void;

const CODE_COLORS = ['#69db7c', '#4dabf7', '#ffd43b', '#f783ac'];
const GREEN = '#69db7c';

function workingScreen(px: Px, category: Agent['category'], t: number): void {
  if (category === 'code') {
    px(0, 0, 12, 7, '#0d1117');
    const scroll = Math.floor(t / 600);
    for (let i = 0; i < 3; i++) {
      const n = (i + scroll) % 7;
      px(n % 3 === 0 ? 1 : 3, 1 + i * 2, Math.min(3 + ((n * 5) % 7), 9), 1, CODE_COLORS[(i + scroll) % 4]);
    }
    if (tick(t, 400)) px(10, 5, 1, 1, '#ffffff'); // cursor
  } else if (category === 'terminal') {
    px(0, 0, 12, 7, '#0b0b0d');
    const scroll = tick(t, 500, 3);
    for (let i = 0; i < 2; i++) { px(1, 1 + i * 2, 1, 1, GREEN); px(3, 1 + i * 2, 3 + ((i + scroll) % 3) * 2, 1, '#a5adba'); }
    if (!tick(t, 400)) px(1, 5, 2, 1, GREEN);
  } else if (category === 'browser') {
    px(0, 0, 12, 7, '#f1f3f5');
    px(0, 0, 12, 1, '#4dabf7');
    px(1, 2, 5, 3, '#ced4da');
    const scroll = tick(t, 700);
    px(7, 2 + scroll, 4, 1, '#868e96');
    px(7, 4 - scroll, 3, 1, '#adb5bd');
  } else { // thinking: three dots, one lit
    px(0, 0, 12, 7, '#1a1f2b');
    for (let i = 0; i < 3; i++) px(3 + i * 2, 3, 1, 1, tick(t, 250, 3) === i ? '#ffffff' : '#4b5563');
  }
}

/** Screen content of a visible monitor (bezel is static); inner area 12 x 7 at (x-6, y+1). */
export function drawScreen(c: Ctx, agent: Agent, x: number, y: number, t: number): void {
  const px: Px = (dx, dy, w, h, color) => r(c, x - 6 + dx, y + 1 + dy, w, h, color);
  const bang = (color: string): void => { px(5, 1, 2, 3, color); px(5, 5, 2, 1, color); };
  switch (agent.status) {
    case 'working': workingScreen(px, agent.category ?? 'other', t); break;
    case 'error': px(0, 0, 12, 7, tick(t, 300) ? '#7f1d1d' : '#e03131'); bang('#fff5f5'); break;
    case 'waiting': px(0, 0, 12, 7, '#3b2f0d'); bang('#ffd43b'); break;
    case 'done':
      px(0, 0, 12, 7, '#12261b');
      for (const [dx, dy] of [[3, 3], [4, 4], [5, 3], [6, 2], [7, 1]]) px(dx, dy, 1, 1, GREEN); // check mark
      break;
    default:
      px(0, 0, 12, 7, '#10141c');
      px(2 + (agent.id.length % 7), 2 + (agent.id.length % 3), 1, 1, '#3b4a6b'); // idle: a lone pixel at a stable spot
  }
}

function drawClockHands(c: Ctx, cx: number, cy: number, date: Date): void {
  const hand = (angle: number, len: number, color: string) => {
    for (let i = 1; i <= len; i++) r(c, cx + Math.round(Math.sin(angle) * i), cy - Math.round(Math.cos(angle) * i), 1, 1, color);
  };
  const m = date.getMinutes();
  hand((((date.getHours() % 12) + m / 60) / 12) * Math.PI * 2, 2, '#2b2a35');
  hand((m / 60) * Math.PI * 2, 3, '#c92a2a');
  r(c, cx, cy, 1, 1, '#2b2a35');
}

/** Moving parts of the wall: clock hands and the working/waiting counters on the display. */
export function drawWallLive(c: Ctx, room: Room, date: Date, st: { working: number; waiting: number }, lang: Lang, dpr: number): void {
  for (const it of wallItems(room)) {
    if (it.kind === 'clock') drawClockHands(c, it.x + it.w / 2, CLOCK_Y, date);
    if (it.kind !== 'display') continue;
    drawText(c, t(lang, 'room.displayWorking', { n: st.working }), (it.x + 3) * P, (DISPLAY_Y + 6) * P + 1, SMALL_FONT, GREEN, 'left', dpr);
    drawText(c, t(lang, 'room.displayWaiting', { n: st.waiting }), (it.x + 3) * P, (DISPLAY_Y + 12) * P, SMALL_FONT, st.waiting ? '#ffa94d' : '#74c0fc', 'left', dpr);
  }
}
