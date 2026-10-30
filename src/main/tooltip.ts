// Tray tooltip text: "Kayy Office – 3 aktiv · 1 wartet".
import { t } from '../shared/i18n';
import type { Lang } from '../shared/i18n';

export function tooltipText(stats: { working: number; waiting: number }, lang: Lang): string {
  const parts: string[] = [];
  if (stats.working) parts.push(t(lang, 'tooltip.active', { n: stats.working }));
  if (stats.waiting) parts.push(t(lang, 'tooltip.waiting', { n: stats.waiting }));
  return parts.length ? `Kayy Office – ${parts.join(' · ')}` : t(lang, 'tooltip.idle');
}
