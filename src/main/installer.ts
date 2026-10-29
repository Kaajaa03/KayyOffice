import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { EVENT_NAMES } from '../shared/types';

export const MARKER = '--kayy-office';

interface HookEntry { matcher?: string; hooks?: Array<{ type: string; command?: string }> }
type Settings = { hooks?: Record<string, HookEntry[]> } & Record<string, unknown>;

const isOurs = (e: HookEntry) => !!e.hooks?.some((h) => h.command?.includes(MARKER));

function readSettings(path: string): Settings {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as Settings;
  } catch (err) {
    throw new Error(`Cannot parse ${path} (settings.json is not valid JSON): ${(err as Error).message}`);
  }
}

export function installHooks(settingsPath: string, hookScriptPath: string): { backupPath: string | null } {
  const settings = readSettings(settingsPath);
  let backupPath: string | null = null;
  if (existsSync(settingsPath)) {
    backupPath = `${settingsPath}.kayy-backup-${Date.now()}`;
    copyFileSync(settingsPath, backupPath);
  }
  const command = `node "${hookScriptPath.replace(/\\/g, '/')}" ${MARKER}`;
  const hooks = settings.hooks ?? {};
  for (const name of EVENT_NAMES) {
    const kept = (hooks[name] ?? []).filter((e) => !isOurs(e));
    const ours: HookEntry = { hooks: [{ type: 'command', command }] };
    if (name === 'PreToolUse' || name === 'PostToolUse') ours.matcher = '*';
    hooks[name] = [...kept, ours];
  }
  settings.hooks = hooks;
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return { backupPath };
}

export function uninstallHooks(settingsPath: string): void {
  if (!existsSync(settingsPath)) return;
  const settings = readSettings(settingsPath);
  if (!settings.hooks) return;
  for (const [name, entries] of Object.entries(settings.hooks)) {
    const kept = entries.filter((e) => !isOurs(e));
    if (kept.length) settings.hooks[name] = kept;
    else delete settings.hooks[name];
  }
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}
