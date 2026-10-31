// Cached text drawing: header/footer lines, name pills, bench tags and the start hint.
import type { Lang } from '../shared/i18n';
import { modelChip } from '../shared/model';
import type { Agent } from '../shared/types';
import { cached, offscreen } from './pixels';
import type { Ctx } from './pixels';
import { pillLines } from './pill';

export const FONT = '"Segoe UI", system-ui, sans-serif';
export const MONO = 'ui-monospace, Consolas, monospace';
export const SMALL_FONT = `700 7px ${FONT}`;
export const HEADER_FONT = `700 10px ${FONT}`;
export const FOOTER_FONT = `600 10px ${FONT}`;
const PILL_TITLE = `700 9px ${FONT}`;
const PILL_SUB = `600 8px ${FONT}`;

export const PILL_H = 23; // 2 px more than the text needs: room for the task-progress bar
const PILL_MAX = 72;
export const BENCH_TAG_H = 11;
const TAG_MAX = 54;

export type Chip = ReturnType<typeof modelChip>;

let measureCtx: Ctx | null = null;
const widthCache = new Map<string, number>();
export const measure = (text: string, font: string): number => {
  const k = font + '|' + text;
  let w = widthCache.get(k);
  if (w === undefined) {
    measureCtx ??= document.createElement('canvas').getContext('2d')!;
    measureCtx.font = font;
    w = measureCtx.measureText(text).width;
    if (widthCache.size > 2000) widthCache.clear();
    widthCache.set(k, w);
  }
  return w;
};

/** Shortens `text` with an ellipsis until it fits `max` css px (keeps at least `min` characters). */
export const fit = (text: string, font: string, max: number, min = 2): string => {
  let t = text;
  while (t.length > min && measure(t, font) > max) t = t.replace(/…$/, '').slice(0, -1) + '…';
  return t;
};

const textCanvas = (key: string, dpr: number, w: number, h: number, paint: (c: Ctx) => void): HTMLCanvasElement =>
  cached(`t|${key}|${dpr}`, () => {
    const [cv, c] = offscreen(w, h, dpr);
    paint(c);
    return cv;
  });

const fillRound = (q: Ctx, color: string, x: number, y: number, w: number, h: number, rad: number): void => {
  q.fillStyle = color;
  q.beginPath();
  q.roundRect(x, y, w, h, rad);
  q.fill();
};

/** Dark rounded plate behind pill and tag text. */
const plate = (q: Ctx, w: number, h: number, alpha: number, rad: number): void =>
  fillRound(q, `rgba(22,26,36,${alpha})`, 0.5, 0.5, w - 1, h - 1, rad);

/** Model chip: coloured square with the family letter. */
function chipBadge(q: Ctx, chip: NonNullable<Chip>, x: number, y: number, w: number, h: number, rad: number, fontPx: number, textY: number): void {
  fillRound(q, chip.color, x, y, w, h, rad);
  q.fillStyle = '#0b1020';
  q.font = `800 ${fontPx}px ${FONT}`;
  q.textAlign = 'center';
  q.fillText(chip.letter, x + w / 2, textY);
  q.textAlign = 'left';
}

/** Snaps a css coordinate to a whole device pixel, so text stays sharp at fractional scales. */
const snap = (v: number, dpr: number): number => Math.round(v * dpr) / dpr;

/** Single line of cached text at css (x, baseline y). */
export function drawText(c: Ctx, text: string, x: number, y: number, font: string, color: string, align: 'left' | 'center' | 'right', dpr: number): void {
  const w = Math.ceil(measure(text, font)) + 2;
  const cv = textCanvas(`txt|${text}|${font}|${color}`, dpr, w, 14, (q) => {
    q.font = font;
    q.fillStyle = color;
    q.fillText(text, 1, 10);
  });
  const left = align === 'left' ? x : align === 'center' ? x - w / 2 : x - w;
  c.drawImage(cv, snap(left, dpr), snap(y - 10, dpr), w, 14);
}

/** One centred line made of differently coloured runs, joined by a dim separator. */
export function drawTextRuns(c: Ctx, runs: Array<{ text: string; color: string }>, cx: number, y: number, font: string, sepColor: string, dpr: number): void {
  const SEP = '  ·  ';
  const widths = runs.map((q) => Math.ceil(measure(q.text, font)) + 2);
  const sepW = Math.ceil(measure(SEP, font)) + 2;
  let x = cx - (widths.reduce((a, b) => a + b, 0) + sepW * (runs.length - 1)) / 2;
  runs.forEach((q, i) => {
    if (i) { drawText(c, SEP, x, y, font, sepColor, 'left', dpr); x += sepW; }
    drawText(c, q.text, x, y, font, q.color, 'left', dpr);
    x += widths[i];
  });
}

const SUB_COLOR: Partial<Record<Agent['status'], string>> = { waiting: '#ffc078', error: '#ffa8a8' };

function pillParts(agent: Agent, lang: Lang) {
  const p = pillLines(agent, lang);
  const chip = modelChip(agent.model);
  const extra = 12 + (chip ? 12 : 0);
  const title = fit(p.title, PILL_TITLE, PILL_MAX - extra);
  const sub = fit(p.sub, PILL_SUB, PILL_MAX - 10);
  const subColor = SUB_COLOR[agent.status] ?? '#b8c1d1';
  const w = Math.ceil(Math.max(measure(title, PILL_TITLE) + extra, measure(sub, PILL_SUB) + 10) + 4);
  return { p, chip, title, sub, subColor, w };
}

/** Width in css px of the name pill (needed for collision placement before drawing). */
export const pillWidth = (agent: Agent, lang: Lang): number => pillParts(agent, lang).w;

/** Lumio-style name pill centred at css (cx, top). */
export function drawPill(c: Ctx, agent: Agent, cx: number, top: number, dpr: number, lang: Lang): void {
  const { p, chip, title, sub, subColor, w } = pillParts(agent, lang);
  const bar = p.progress === undefined ? -1 : Math.round(p.progress * 100);
  const cv = textCanvas(`pill|${title}|${sub}|${p.dot}|${chip?.letter}|${subColor}|${bar}`, dpr, w, PILL_H, (q) => {
    plate(q, w, PILL_H, 0.9, 6);
    q.fillStyle = p.dot;
    q.beginPath();
    q.arc(7, 7, 2.6, 0, Math.PI * 2);
    q.fill();
    q.fillStyle = '#f1f3f5';
    q.font = PILL_TITLE;
    q.fillText(title, 12, 10.5);
    if (chip) chipBadge(q, chip, 12 + measure(title, PILL_TITLE) + 3, 2.5, 9, 9, 2.5, 7, 9.6);
    q.fillStyle = subColor;
    q.font = PILL_SUB;
    q.fillText(sub, 5, 18.5);
    if (p.progress !== undefined) {
      const bw = w - 10;
      q.fillStyle = 'rgba(255,255,255,0.14)';
      q.fillRect(5, PILL_H - 4, bw, 2);
      q.fillStyle = '#ffd43b';
      q.fillRect(5, PILL_H - 4, Math.max(p.progress > 0 ? 1 : 0, Math.round(bw * p.progress)), 2);
    }
  });
  c.drawImage(cv, snap(cx - w / 2, dpr), snap(top, dpr), w, PILL_H);
}

const benchTagText = (name: string): string => fit(name, SMALL_FONT, TAG_MAX);
export const benchTagWidth = (name: string, chip: Chip): number => Math.ceil(measure(benchTagText(name), SMALL_FONT) + 8 + (chip ? 11 : 0));

/** Dim label of a figure on the bench: name plus optional model chip, one line. */
export function drawBenchTag(c: Ctx, name: string, chip: Chip, cx: number, top: number, dpr: number): void {
  const text = benchTagText(name);
  const w = benchTagWidth(name, chip);
  const cv = textCanvas(`tag|${text}|${chip?.letter}`, dpr, w, BENCH_TAG_H, (q) => {
    plate(q, w, BENCH_TAG_H, 0.72, 4);
    q.fillStyle = '#c4cad6';
    q.font = SMALL_FONT;
    q.fillText(text, 4, 8);
    if (chip) chipBadge(q, chip, 4 + measure(text, SMALL_FONT) + 3, 1.5, 7, 8, 2, 6, 7.6);
  });
  c.drawImage(cv, snap(cx - w / 2, dpr), snap(top, dpr), w, BENCH_TAG_H);
}

/** Small pill shown briefly after start so an empty overlay does not look dead. */
export function drawHint(c: Ctx, w: number, raw: string): void {
  c.save();
  const font = `600 12px ${MONO}`;
  const text = fit(raw, font, w - 52); // 36 px chrome + margin
  c.font = font;
  const tw = c.measureText(text).width + 36;
  const x = Math.round((w - tw) / 2);
  c.fillStyle = 'rgba(24,32,46,0.94)';
  c.strokeStyle = 'rgba(255,212,59,0.7)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.roundRect(x, 0, tw, 34, [0, 0, 14, 14]);
  c.fill();
  c.stroke();
  c.fillStyle = '#ffd43b';
  c.fillRect(x + 14, 14, 6, 6);
  c.fillStyle = '#e5e7eb';
  c.textAlign = 'left';
  c.fillText(text, x + 28, 21);
  c.restore();
}
