// Pure helpers for the live status shown in the welcome window and the tray tooltip.
import { t } from '../shared/i18n';
import type { Lang } from '../shared/i18n';
import type { ApprovalMode } from './approvals';
import { MARKER } from './installer';

/** Live rows of the welcome window. */
export interface WelcomeStatus { hooks: boolean; mode: ApprovalMode; port: number }

/** True when ~/.claude/settings.json (text) registers at least one Kayy hook. Never throws. */
export function hooksInstalled(settingsText: string | null): boolean {
  if (!settingsText) return false;
  let parsed: unknown;
  try { parsed = JSON.parse(settingsText.replace(/^\uFEFF/, '')); } catch { return false; }
  const hooks = (parsed as { hooks?: unknown } | null)?.hooks;
  if (!hooks || typeof hooks !== 'object') return false;
  return Object.values(hooks).some((entries) => Array.isArray(entries) && entries.some((e: unknown) => {
    const inner = (e as { hooks?: unknown } | null)?.hooks;
    return Array.isArray(inner) && inner.some((h: unknown) => {
      const cmd = (h as { command?: unknown } | null)?.command;
      return typeof cmd === 'string' && cmd.includes(MARKER);
    });
  }));
}

interface TooltipStats { working: number; waiting: number }

/** Tray tooltip: "Kayy Office – 3 aktiv · 1 wartet". */
export function tooltipText(stats: TooltipStats, lang: Lang): string {
  const parts: string[] = [];
  if (stats.working) parts.push(t(lang, 'tooltip.active', { n: stats.working }));
  if (stats.waiting) parts.push(t(lang, 'tooltip.waiting', { n: stats.waiting }));
  return parts.length ? `Kayy Office – ${parts.join(' · ')}` : t(lang, 'tooltip.idle');
}
