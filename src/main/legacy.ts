// One-time cleanup of the removed hook path: old installs left `--kayy-office` hook entries in
// Claude's settings.json and a staged hook.js. Runs at startup, needs no click, touches nothing foreign.
import { copyFileSync, existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { appLog } from './diag';
import { writeFileAtomic } from './fsutil';

const MARKER = '--kayy-office';
const KEEP_BACKUPS = 5;
const BOM = new RegExp('^' + String.fromCharCode(0xfeff));

type Entry = { hooks?: Array<{ command?: unknown }> } | null;
const isOurs = (e: Entry) => Array.isArray(e?.hooks) && e.hooks.some((h) => typeof h?.command === 'string' && h.command.includes(MARKER));

/** Keeps KEEP_BACKUPS files: the very first one (state before Kayy touched the file) plus the newest. */
function pruneBackups(settingsPath: string): void {
  const prefix = `${basename(settingsPath)}.kayy-backup-`;
  try {
    const oldestFirst = readdirSync(dirname(settingsPath))
      .filter((n) => n.startsWith(prefix) && /^\d+$/.test(n.slice(prefix.length)))
      .sort((a, b) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length)));
    if (oldestFirst.length <= KEEP_BACKUPS) return;
    const keep = new Set([oldestFirst[0], ...oldestFirst.slice(-(KEEP_BACKUPS - 1))]);
    for (const n of oldestFirst) if (!keep.has(n)) unlinkSync(join(dirname(settingsPath), n));
  } catch { /* housekeeping only */ }
}

/** Removes our old hook entries from `<claudeDir>/settings.json` and the staged `<configDir>/hook.js`.
 *  Returns true when settings.json was changed. Never throws; invalid JSON is left alone. */
export function removeLegacyHooks(claudeDir: string, configDir: string): boolean {
  try { unlinkSync(join(configDir, 'hook.js')); } catch { /* not staged */ }
  const path = join(claudeDir, 'settings.json');
  try {
    if (!existsSync(path)) return false;
    const text = readFileSync(path, 'utf8').replace(BOM, '');
    if (!text.trim()) return false;
    let settings: { hooks?: Record<string, unknown> } | null;
    try { settings = JSON.parse(text); } catch { settings = null; }
    if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
      appLog('warn', 'legacy: settings.json is not a JSON object, left untouched');
      return false;
    }
    const hooks = settings.hooks;
    if (typeof hooks !== 'object' || hooks === null) return false;
    let removed = 0;
    for (const [name, entries] of Object.entries(hooks)) {
      if (!Array.isArray(entries)) continue;
      const kept = entries.filter((e) => !isOurs(e));
      if (kept.length === entries.length) continue;
      removed += entries.length - kept.length;
      if (kept.length) hooks[name] = kept;
      else delete hooks[name];
    }
    if (!removed) return false;
    if (!Object.keys(hooks).length) delete settings.hooks;
    copyFileSync(path, `${path}.kayy-backup-${Date.now()}`);
    pruneBackups(path);
    writeFileAtomic(path, JSON.stringify(settings, null, 2));
    appLog('info', `legacy: removed ${removed} old hook entries from settings.json`);
    return true;
  } catch (e) {
    appLog('warn', 'legacy: cleanup failed', e);
    return false;
  }
}
