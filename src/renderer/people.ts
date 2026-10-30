// The pixel people: a stable look per agent id and the cached 8 x 16 body sprites per pose.
import type { Agent } from '../shared/types';
import { mug, r, rects, shade, sprite } from './pixels';
import type { Ctx } from './pixels';
import type { DayPhase } from './sun';

const PALETTE = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#9775fa', '#f783ac'];
const SKINS = ['#f1c27d', '#c68642', '#e0ac69', '#8d5524'];
const HAIRS = ['#3b2a20', '#1c1c1c', '#c99a4f', '#8a3b22', '#5a4636'];
const PANTS = '#384052';
const SHOE = '#1f2128';

interface Look { skin: string; hair: string; long: boolean; shirt: string }

export type Pose = 'stand' | 'walk0' | 'walk1' | 'back0' | 'back1' | 'sideR0' | 'sideR1' | 'sideL0' | 'sideL1'
  | 'seatFront' | 'seatBack0' | 'seatBack1' | 'lounge' | 'cup';

const hash = (s: string): number => s.split('').reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0);

export function lookFor(agent: Agent): Look {
  const h = hash(agent.id);
  return {
    skin: SKINS[(h >>> 3) % SKINS.length],
    hair: HAIRS[(h >>> 5) % HAIRS.length],
    long: ((h >>> 9) & 1) === 1,
    shirt: agent.color || PALETTE[h % PALETTE.length],
  };
}

function headFront(c: Ctx, l: Look, eyes: 'both' | 'left' | 'right' = 'both'): void {
  rects(c, 0, 0, [[1, 1, 6, 5, l.skin], [1, 0, 6, 2, l.hair], [1, 2, 1, 1, l.hair], [6, 2, 1, 1, l.hair]]);
  if (l.long) rects(c, 0, 0, [[0, 1, 1, 6, l.hair], [7, 1, 1, 6, l.hair]]);
  if (eyes !== 'right') r(c, 2, 3, 1, 1, '#2a2230');
  if (eyes !== 'left') r(c, 5, 3, 1, 1, '#2a2230');
  if (eyes === 'both') r(c, 3, 5, 2, 1, shade(l.skin, 0.8));
}

function headBack(c: Ctx, l: Look): void {
  rects(c, 0, 0, [[1, 0, 6, 6, l.hair], [1, 5, 6, 1, shade(l.hair, 1.15)]]);
  if (l.long) rects(c, 0, 0, [[0, 1, 8, 7, l.hair], [1, 7, 6, 1, shade(l.hair, 0.8)]]);
}

const sleeve = (l: Look): string => shade(l.shirt, 0.78);

function torso(c: Ctx, l: Look, h: number, armsDown = true): void {
  rects(c, 0, 0, [[1, 6, 6, h, l.shirt], [3, 6, 2, 1, shade(l.shirt, 1.3)]]);
  if (armsDown) rects(c, 0, 0, [[0, 7, 1, Math.min(4, h - 1), sleeve(l)], [7, 7, 1, Math.min(4, h - 1), sleeve(l)]]);
}

/** frame 0/1 = one leg shorter (walking), -1 = both legs down. */
function legs(c: Ctx, frame: -1 | 0 | 1): void {
  const left = frame === 1 ? 2 : 3, right = frame === 0 ? 2 : 3;
  rects(c, 0, 12, [[1, 0, 2, left, PANTS], [1, left, 2, 1, SHOE], [5, 0, 2, right, PANTS], [5, right, 2, 1, SHOE]]);
}

function paintPerson(c: Ctx, l: Look, pose: Pose): void {
  switch (pose) {
    case 'stand': case 'walk0': case 'walk1': case 'cup':
      headFront(c, l);
      torso(c, l, 6);
      rects(c, 0, 0, [[0, 11, 1, 1, l.skin], [7, 11, 1, 1, l.skin]]);
      legs(c, pose === 'walk0' ? 0 : pose === 'walk1' ? 1 : -1);
      if (pose === 'cup') { mug(c, 6, 8, 3, 3); r(c, 6, 10, 3, 1, '#d8d2c6'); }
      break;
    case 'back0': case 'back1':
      headBack(c, l);
      torso(c, l, 6);
      legs(c, pose === 'back0' ? 0 : 1);
      break;
    case 'sideR0': case 'sideR1': case 'sideL0': case 'sideL1': {
      const right = pose.startsWith('sideR');
      headFront(c, l, right ? 'right' : 'left');
      r(c, right ? 1 : 6, 1, 1, 4, l.hair);
      torso(c, l, 6, false);
      r(c, right ? 3 : 4, 7, 1, 4, sleeve(l));
      legs(c, pose.endsWith('0') ? 0 : 1);
      break;
    }
    case 'seatFront':
      headFront(c, l);
      torso(c, l, 5);
      break;
    case 'seatBack0': case 'seatBack1': { // typing: the arms alternate
      const up = pose === 'seatBack1' ? 1 : 0;
      headBack(c, l);
      torso(c, l, 6, false);
      rects(c, 0, 0, [[0, 6 - up, 1, 3, sleeve(l)], [7, 5 + up, 1, 3, sleeve(l)]]);
      break;
    }
    case 'lounge':
      headFront(c, l);
      torso(c, l, 5);
      rects(c, 0, 0, [[1, 11, 6, 2, PANTS], [1, 13, 2, 1, SHOE], [5, 13, 2, 1, SHOE]]);
      mug(c, 3, 8, 2, 2);
      break;
  }
}

export const personSprite = (l: Look, pose: Pose, dpr: number, phase: DayPhase): HTMLCanvasElement =>
  sprite(`p|${l.skin}|${l.hair}|${l.long}|${l.shirt}|${pose}`, 9, 16, dpr, phase, (c) => paintPerson(c, l, pose));
