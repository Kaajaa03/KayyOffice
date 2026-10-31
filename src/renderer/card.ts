// The permission card: drawing (returns the clickable button rects) and the arming delay per risk.
import { t } from '../shared/i18n';
import type { Lang } from '../shared/i18n';
import type { PermissionRequestInfo } from '../shared/types';
import { riskOf } from '../shared/risk';
import { ARM_DELAY_MS } from './clickguard';
import { MONO, fit, measure } from './text';

export interface Hit { x: number; y: number; w: number; h: number; id: string; decision: 'allow' | 'deny' | 'choice'; choice?: number }

export const CARD_W = 400;
export const CARD_H = 100;
const HIGH_RISK_DELAY_MS = 1500;
const TEXT_W = CARD_W - 28;
const BTN = { y: 66, w: 90, h: 26 };

const TITLE_FONT = `600 12px ${MONO}`;
const BODY_FONT = `11px ${MONO}`;
const NOTE_FONT = `700 11px ${MONO}`;
const BTN_FONT = `700 12px ${MONO}`;

/** Risky requests (Blast Radius) need a longer look before they can be clicked. */
export function armDelay(req: PermissionRequestInfo): number {
  if (req.options) return ARM_DELAY_MS; // a question is no risk, but is just as unclickable until read
  return riskOf(req.tool, req.summary).level === 'high' ? HIGH_RISK_DELAY_MS : ARM_DELAY_MS;
}

/** Splits `text` into at most two lines that fit `max` px (words first, the second line is cut with an ellipsis). */
function twoLines(text: string, font: string, max: number): [string, string] {
  if (measure(text, font) <= max) return [text, ''];
  let cut = text.length;
  while (cut > 1 && measure(text.slice(0, cut), font) > max) cut--;
  const space = text.lastIndexOf(' ', cut);
  if (space > cut / 2) cut = space;
  return [text.slice(0, cut).trimEnd(), fit(text.slice(cut).trimStart(), font, max, 1)];
}

/** The question card: the question and one button per option label (max 4, side by side). */
function drawQuestionCard(
  c: CanvasRenderingContext2D, x: number, y: number,
  req: PermissionRequestInfo, extra: number, asker: string, lang: Lang, hover: Hit | null,
): Hit[] {
  const options = req.options ?? [];
  c.save();
  c.translate(x, y);
  c.fillStyle = '#18202e';
  c.strokeStyle = '#74c0fc';
  c.lineWidth = 1.5;
  c.beginPath();
  c.roundRect(0, 0, CARD_W, CARD_H, 12);
  c.fill();
  c.stroke();
  c.textAlign = 'left';
  c.font = TITLE_FONT;
  c.fillStyle = '#e5e7eb';
  const more = extra > 0 ? t(lang, 'card.more', { n: extra }) : '';
  const titleW = more ? TEXT_W - measure(more, TITLE_FONT) - 8 : TEXT_W; // keep clear of the "+N more" on the same line
  c.fillText(fit(t(lang, 'card.asks', { who: asker }), TITLE_FONT, titleW, 1), 14, 20);
  const [l1, l2] = twoLines(req.summary || t(lang, 'card.noDetails'), BODY_FONT, TEXT_W);
  c.font = BODY_FONT;
  c.fillStyle = '#cbd5e1';
  c.fillText(l1, 14, 37);
  if (l2) c.fillText(l2, 14, 50);
  if (more) { c.fillStyle = '#9ca3af'; c.textAlign = 'right'; c.fillText(more, CARD_W - 14, 20); c.textAlign = 'left'; }

  const hits: Hit[] = [];
  const gap = 6;
  const w = Math.floor((TEXT_W - gap * (options.length - 1)) / options.length);
  options.forEach((opt, i) => {
    const bx = 14 + i * (w + gap);
    const hot = hover?.id === req.id && hover.choice === i;
    c.fillStyle = hot ? '#74c0fc' : '#74c0fccc';
    c.beginPath();
    c.roundRect(bx, BTN.y, w, BTN.h, 8);
    c.fill();
    c.fillStyle = '#0b1020';
    c.font = BTN_FONT;
    c.textAlign = 'center';
    c.fillText(fit(opt, BTN_FONT, w - 10, 1), bx + w / 2, 83);
    hits.push({ x: x + bx, y: y + BTN.y, w, h: BTN.h, id: req.id, decision: 'choice', choice: i });
  });
  c.restore();
  return hits;
}

/** Draws the permission card at (x, y) and returns the clickable button rects (window coordinates). */
export function drawPermissionCard(
  c: CanvasRenderingContext2D, x: number, y: number,
  req: PermissionRequestInfo, extra: number, asker: string, lang: Lang, hover: Hit | null,
): Hit[] {
  if (req.options) return drawQuestionCard(c, x, y, req, extra, asker, lang, hover);
  const risk = riskOf(req.tool, req.summary);
  const high = risk.level === 'high';
  const line = (font: string, color: string, text: string, ty: number): void => {
    c.font = font;
    c.fillStyle = color;
    c.fillText(fit(text, font, TEXT_W, 1), 14, ty);
  };
  c.save();
  c.translate(x, y);
  c.fillStyle = '#18202e';
  c.strokeStyle = high ? '#ff6b6b' : '#ffd43b';
  c.lineWidth = 1.5;
  c.beginPath();
  c.roundRect(0, 0, CARD_W, CARD_H, 12);
  c.fill();
  c.stroke();

  c.textAlign = 'left';
  line(TITLE_FONT, '#e5e7eb', t(lang, 'card.wants', { who: asker, tool: req.tool }), 22);
  line(BODY_FONT, '#9ca3af', req.summary || t(lang, 'card.noDetails'), 40);
  if (risk.note) line(NOTE_FONT, high ? '#ff8787' : '#ffd43b', `⚠ ${t(lang, risk.note)}${risk.target ? ' → ' + risk.target : ''}`, 58);
  if (extra > 0) { c.font = BODY_FONT; c.fillStyle = '#9ca3af'; c.fillText(t(lang, 'card.more', { n: extra }), 14, 90); }

  const hits: Hit[] = [];
  const button = (bx: number, label: string, color: string, decision: 'allow' | 'deny'): void => {
    const hot = hover?.id === req.id && hover.decision === decision;
    c.fillStyle = hot ? color : color + 'cc';
    c.beginPath();
    c.roundRect(bx, BTN.y, BTN.w, BTN.h, 8);
    c.fill();
    c.fillStyle = '#0b1020';
    c.font = BTN_FONT;
    c.textAlign = 'center';
    c.fillText(label, bx + BTN.w / 2, 83);
    hits.push({ x: x + bx, y: y + BTN.y, w: BTN.w, h: BTN.h, id: req.id, decision });
  };
  button(CARD_W - 200, t(lang, 'card.allow'), high ? '#ffa94d' : '#69db7c', 'allow');
  button(CARD_W - 104, t(lang, 'card.deny'), '#ff6b6b', 'deny');
  c.restore();
  return hits;
}
