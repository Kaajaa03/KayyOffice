// Pure footer text: counts, cost, context usage and the account limit, each with an optional warning level.
import { t } from '../shared/i18n';
import type { Lang } from '../shared/i18n';
import { formatCost } from '../shared/model';
import type { Agent } from '../shared/types';
import { officeStats } from './scene';

type MeterLevel = 'ok' | 'warn' | 'high';

export const meterLevel = (percent: number): MeterLevel => (percent >= 85 ? 'high' : percent >= 70 ? 'warn' : 'ok');

interface FooterPart { text: string; level?: MeterLevel }

const KIND_LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7d' };

/** The limit to show: five_hour when known, else the highest of the other kinds. */
function pickLimit(agents: Agent[]): { kind: string; percent: number } | null {
  let best: { kind: string; percent: number } | null = null;
  for (const a of agents) {
    const l = a.limit;
    if (!l) continue;
    const better = !best
      || (l.kind === 'five_hour') > (best.kind === 'five_hour')
      || ((l.kind === 'five_hour') === (best.kind === 'five_hour') && l.percent > best.percent);
    if (better) best = l;
  }
  return best;
}

export function footerParts(agents: Agent[], lang: Lang): FooterPart[] {
  const s = officeStats(agents);
  const parts: FooterPart[] = [{ text: t(lang, s.total === 1 ? 'footer.agents.one' : 'footer.agents.other', { n: s.total }) }];
  if (s.working) parts.push({ text: t(lang, 'footer.active', { n: s.working }) });
  if (s.waiting) parts.push({ text: t(lang, 'footer.waiting', { n: s.waiting }) });
  if (s.costUsd !== null) parts.push({ text: formatCost(s.costUsd) });
  const ctx = agents.filter((a) => !a.parentId && a.context).map((a) => a.context!.percent);
  if (ctx.length) {
    const p = Math.max(...ctx);
    parts.push({ text: t(lang, 'footer.context', { n: p }), level: meterLevel(p) });
  }
  const limit = pickLimit(agents);
  if (limit) parts.push({ text: t(lang, 'footer.limit', { kind: KIND_LABEL[limit.kind] ?? limit.kind, n: limit.percent }), level: meterLevel(limit.percent) });
  return parts;
}
