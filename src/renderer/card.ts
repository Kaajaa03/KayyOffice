import { t } from '../shared/i18n';
import type { Lang } from '../shared/i18n';
import type { PermissionRequestInfo } from '../shared/types';
import { riskOf } from '../shared/risk';
import { ARM_DELAY_MS } from './clickguard';

export interface Hit { x: number; y: number; w: number; h: number; id: string; decision: 'allow' | 'deny' }

export const CARD_W = 400;
export const CARD_H = 100;
const HIGH_RISK_DELAY_MS = 1500;

const TEXT_W = CARD_W - 28;

/** Shortens `text` with an ellipsis until it fits `maxW` in the context's current font. */
function fit(c: CanvasRenderingContext2D, text: string, maxW: number): string {
  let out = text;
  while (out.length > 1 && c.measureText(out).width > maxW) out = out.replace(/…$/, '').slice(0, -1) + '…';
  return out;
}

/** Risky requests (Blast Radius) need a longer look before they can be clicked. */
export function armDelay(req: PermissionRequestInfo): number {
  return riskOf(req.tool, req.summary).level === 'high' ? HIGH_RISK_DELAY_MS : ARM_DELAY_MS;
}

/** Draws the permission card at (x, y) and returns the clickable button rects (window coordinates). */
export function drawPermissionCard(
  c: CanvasRenderingContext2D, x: number, y: number,
  req: PermissionRequestInfo, extra: number, asker: string, lang: Lang, hover: Hit | null,
): Hit[] {
  const risk = riskOf(req.tool, req.summary);
  const accent = risk.level === 'high' ? '#ff6b6b' : '#ffd43b';
  c.save();
  c.translate(x, y);
  c.fillStyle = '#18202e';
  c.strokeStyle = accent;
  c.lineWidth = 1.5;
  c.beginPath();
  c.roundRect(0, 0, CARD_W, CARD_H, 12);
  c.fill();
  c.stroke();

  c.textAlign = 'left';
  c.font = '600 12px ui-monospace, Consolas, monospace';
  c.fillStyle = '#e5e7eb';
  c.fillText(fit(c, t(lang, 'card.wants', { who: asker, tool: req.tool }), TEXT_W), 14, 22);
  c.font = '11px ui-monospace, Consolas, monospace';
  c.fillStyle = '#9ca3af';
  c.fillText(fit(c, req.summary || t(lang, 'card.noDetails'), TEXT_W), 14, 40);
  if (risk.note) {
    c.font = '700 11px ui-monospace, Consolas, monospace';
    c.fillStyle = risk.level === 'high' ? '#ff8787' : '#ffd43b';
    c.fillText(fit(c, `⚠ ${t(lang, risk.note)}${risk.target ? ' → ' + risk.target : ''}`, TEXT_W), 14, 58);
  }
  if (extra > 0) {
    c.font = '11px ui-monospace, Consolas, monospace';
    c.fillStyle = '#9ca3af';
    c.fillText(t(lang, 'card.more', { n: extra }), 14, 90);
  }

  const hits: Hit[] = [];
  const btn = (bx: number, label: string, color: string, decision: 'allow' | 'deny') => {
    const hit: Hit = { x: x + bx, y: y + 66, w: 90, h: 26, id: req.id, decision };
    const hot = hover?.id === req.id && hover.decision === decision;
    c.fillStyle = hot ? color : color + 'cc';
    c.beginPath();
    c.roundRect(bx, 66, 90, 26, 8);
    c.fill();
    c.fillStyle = '#0b1020';
    c.font = '700 12px ui-monospace, Consolas, monospace';
    c.textAlign = 'center';
    c.fillText(label, bx + 45, 83);
    hits.push(hit);
  };
  btn(CARD_W - 200, t(lang, 'card.allow'), risk.level === 'high' ? '#ffa94d' : '#69db7c', 'allow');
  btn(CARD_W - 104, t(lang, 'card.deny'), '#ff6b6b', 'deny');
  c.restore();
  return hits;
}
