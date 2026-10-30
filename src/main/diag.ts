import { appendFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const APP_LOG_MAX_BYTES = 256 * 1024;
const MAX_FIELD = 300;

type Level = 'info' | 'warn' | 'error';
let logPath: string | null = null;

/** Where app.log lives (the config dir). Until called, appLog is a no-op. */
export function initDiag(dir: string): void {
  logPath = join(dir, 'app.log');
}

export const appLogPath = (): string | null => logPath;

/** One flat, bounded line. Long hex runs (tokens, nonces, proofs) never reach the file. */
const clean = (v: string) => v.replace(/\s+/g, ' ').replace(/[0-9a-f]{32,}/gi, '[redacted]').slice(0, MAX_FIELD);

function errorText(err: unknown): string {
  const m = err instanceof Error ? err.message : typeof err === 'string' ? err : (err as { message?: unknown } | null)?.message;
  return typeof m === 'string' ? clean(m) : '';
}

/** Diagnostics for the user ("Diagnose" in the tray). Callers pass a module-ish message, never
 *  commands, paths with secrets or tool output; only the error's message (no stack) is kept. */
export function appLog(level: Level, msg: string, err?: unknown): void {
  try {
    if (!logPath) return;
    const detail = err === undefined ? '' : errorText(err);
    const line = `${new Date().toISOString()} ${level.toUpperCase()} ${clean(msg)}${detail ? ` | ${detail}` : ''}\n`;
    try {
      if (statSync(logPath).size >= APP_LOG_MAX_BYTES) renameSync(logPath, `${logPath}.1`);
    } catch { /* no file yet */ }
    appendFileSync(logPath, line);
  } catch { /* diagnostics must never break the app */ }
}
