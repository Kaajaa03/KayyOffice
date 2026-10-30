// Debug/test command-line flags in one place; unknown or malformed values fall back to "not set".
import { parseLanguage } from '../shared/i18n';
import type { Lang } from '../shared/i18n';

export interface Flags {
  demo: boolean;
  demoCount: number; // --demo-count=<n>: n sample agents (implies demo)
  screenshot?: string; // --screenshot=<png>: capture the window, then quit
  perf?: string; // --perf=<json>: sample CPU/RAM, write the result, then quit
  perfSeconds: number;
  configDir?: string; // --config-dir=<path>: keep manual runs away from the real settings
  claudeDir?: string; // --claude-dir=<path>: replaces ~/.claude (Claude's settings.json), for manual runs
  lang?: Lang;
  scale?: number;
  hour?: number; // 0-23: simulated time of day
  noCard: boolean; // demo without the sample permission card
  overlayWidth?: number; // px, 3-4 digits
  settings: boolean; // open the settings window at start
}

const DEFAULT_PERF_SECONDS = 20;

export function parseFlags(argv: readonly string[]): Flags {
  // packaged: argv = [exe, ...flags]; dev: [electron, appPath, ...flags] -> only the --flags count
  const raw = new Map<string, string>();
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    raw.set(eq < 0 ? a.slice(2) : a.slice(2, eq), eq < 0 ? '' : a.slice(eq + 1));
  }
  const text = (name: string) => raw.get(name) || undefined;
  const int = (name: string, digits: RegExp) => { const v = raw.get(name); return v !== undefined && digits.test(v) ? Number(v) : undefined; };
  const num = (name: string) => { const n = Number(raw.get(name) || NaN); return Number.isFinite(n) ? n : undefined; };

  const demoCount = Math.max(0, Math.floor(num('demo-count') ?? 0));
  const hour = int('hour', new RegExp('^[0-9]{1,2}$'));
  const perfSeconds = num('perf-seconds');
  return {
    demo: raw.has('demo') || demoCount > 0,
    demoCount,
    screenshot: text('screenshot'),
    perf: text('perf'),
    perfSeconds: perfSeconds !== undefined && perfSeconds > 0 ? perfSeconds : DEFAULT_PERF_SECONDS,
    configDir: text('config-dir'),
    claudeDir: text('claude-dir'),
    lang: parseLanguage(raw.get('lang')),
    scale: num('scale'),
    hour: hour !== undefined && hour <= 23 ? hour : undefined,
    noCard: raw.has('no-card'),
    overlayWidth: int('overlay-width', new RegExp('^[0-9]{3,4}$')),
    settings: raw.has('settings'),
  };
}
