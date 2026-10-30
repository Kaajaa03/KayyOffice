import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { EVENT_NAMES } from '../shared/types';
import { writeFileAtomic } from './fsutil';

export const MARKER = '--kayy-office';
const PERMISSION_HOOK_TIMEOUT_S = 25;
const KEEP_BACKUPS = 5;
const BOM = new RegExp('^' + String.fromCharCode(0xfeff));

interface HookEntry { matcher?: string; hooks?: Array<{ type: string; command?: string; timeout?: number }> }
type Settings = { hooks?: Record<string, HookEntry[]> } & Record<string, unknown>;

const isOurs = (e: HookEntry) => !!e.hooks?.some((h) => h.command?.includes(MARKER));

function readSettings(path: string): Settings {
  if (!existsSync(path)) return {};
  try {
    const text = readFileSync(path, 'utf8').replace(BOM, '');
    if (!text.trim()) return {};
    const parsed = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as Settings;
  } catch {
    // no parser message: V8 quotes a snippet of the file, which may be a secret
    throw new Error(`Cannot parse ${path} (settings.json is not valid JSON)`);
  }
}

/** Copies the current file to `<file>.kayy-backup-<ts>`; see pruneBackups for what is kept. */
function backup(settingsPath: string): string | null {
  if (!existsSync(settingsPath)) return null;
  const backupPath = `${settingsPath}.kayy-backup-${Date.now()}`;
  copyFileSync(settingsPath, backupPath);
  pruneBackups(settingsPath);
  return backupPath;
}

/** Keeps KEEP_BACKUPS files: the very first one (the state before Kayy ever touched the file)
 *  plus the newest ones. Only `<name>.kayy-backup-<digits>` files are ever considered. */
function pruneBackups(settingsPath: string): void {
  const dir = dirname(settingsPath);
  const prefix = `${basename(settingsPath)}.kayy-backup-`;
  const stamp = (n: string) => Number(n.slice(prefix.length));
  try {
    const oldestFirst = readdirSync(dir)
      .filter((n) => n.startsWith(prefix) && /^\d+$/.test(n.slice(prefix.length)))
      .sort((a, b) => stamp(a) - stamp(b));
    if (oldestFirst.length <= KEEP_BACKUPS) return;
    const keep = new Set([oldestFirst[0], ...oldestFirst.slice(-(KEEP_BACKUPS - 1))]);
    for (const n of oldestFirst) if (!keep.has(n)) unlinkSync(join(dir, n));
  } catch { /* backup pruning is housekeeping; the install itself must not fail because of it */ }
}

/** Copies hook.js to a stable per-user path so settings.json never points into a
 *  temporary/portable extraction folder or an install dir that may be removed later. */
export function stageHook(src: string, destDir: string): string {
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, 'hook.js');
  copyFileSync(src, dest);
  return dest;
}

export function installHooks(settingsPath: string, hookScriptPath: string): { backupPath: string | null } {
  const settings = readSettings(settingsPath);
  const backupPath = backup(settingsPath);
  const command = `node "${hookScriptPath.replace(/\\/g, '/')}" ${MARKER}`;
  const hooks = settings.hooks ?? {};
  // PostToolUseFailure is a Claude Code event of its own; hook.js reports it as PostToolUse + ERROR.
  for (const name of [...EVENT_NAMES, 'PostToolUseFailure']) {
    const kept = (hooks[name] ?? []).filter((e) => !isOurs(e));
    const ours: HookEntry = { hooks: [{ type: 'command', command }] };
    if (name === 'PreToolUse' || name === 'PostToolUse' || name === 'PostToolUseFailure') ours.matcher = '*';
    hooks[name] = [...kept, ours];
  }
  const keptPerm = (hooks.PermissionRequest ?? []).filter((e) => !isOurs(e));
  hooks.PermissionRequest = [
    ...keptPerm,
    { matcher: '*', hooks: [{ type: 'command', command: `${command} --permission`, timeout: PERMISSION_HOOK_TIMEOUT_S }] },
  ];
  settings.hooks = hooks;
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileAtomic(settingsPath, JSON.stringify(settings, null, 2));
  return { backupPath };
}

export function uninstallHooks(settingsPath: string): void {
  if (!existsSync(settingsPath)) return;
  const settings = readSettings(settingsPath);
  if (!settings.hooks) return;
  backup(settingsPath);
  for (const [name, entries] of Object.entries(settings.hooks)) {
    const kept = entries.filter((e) => !isOurs(e));
    if (kept.length) settings.hooks[name] = kept;
    else delete settings.hooks[name];
  }
  writeFileAtomic(settingsPath, JSON.stringify(settings, null, 2));
}
