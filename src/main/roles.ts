import { existsSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { appLog } from './diag';
import type { Agent, AppState } from '../shared/types';

export interface RoleDef {
  match: { cwdContains?: string; namePattern?: string };
  role: string;
  color: string;
  sprite?: string;
}

const DEFAULT_ROLES: RoleDef[] = [
  { match: { namePattern: 'plan' }, role: 'Planner', color: '#9775fa' },
  { match: { namePattern: 'review' }, role: 'Reviewer', color: '#ffa94d' },
  { match: { namePattern: 'test|qa' }, role: 'Tester', color: '#69db7c' },
  { match: { namePattern: 'explore|research' }, role: 'Researcher', color: '#38d9a9' },
];

function valid(r: unknown): r is RoleDef {
  if (typeof r !== 'object' || r === null) return false;
  const d = r as RoleDef;
  if (typeof d.role !== 'string' || typeof d.color !== 'string' || typeof d.match !== 'object' || d.match === null) return false;
  if (!/^#[0-9a-f]{6}$/i.test(d.color)) return false; // used as canvas gradient base; anything else throws
  const { cwdContains, namePattern } = d.match;
  if (cwdContains === undefined && namePattern === undefined) return false;
  if (cwdContains !== undefined && typeof cwdContains !== 'string') return false;
  if (namePattern !== undefined) {
    if (typeof namePattern !== 'string') return false;
    try { new RegExp(namePattern, 'i'); } catch { return false; }
  }
  return true;
}

// Bounds the work of ordinary patterns. A pathological pattern in the user's own roles.json
// (nested quantifiers) can still stall the main process: roles.json is trusted input.
const MAX_MATCH_CHARS = 200;
const patterns = new WeakMap<RoleDef, RegExp | null>();

function patternOf(r: RoleDef): RegExp | null {
  let re = patterns.get(r);
  if (re === undefined) {
    re = r.match.namePattern === undefined ? null : new RegExp(r.match.namePattern, 'i');
    patterns.set(r, re);
  }
  return re;
}

export function loadRoles(path: string): RoleDef[] {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const roles = Array.isArray(parsed) ? parsed.filter(valid) : [];
    roles.forEach(patternOf); // compile once, up front
    return roles;
  } catch (e) {
    appLog('warn', 'roles: roles.json unreadable, no roles applied', e);
    return [];
  }
}

/** roles.json: the sample is written on first run (never overwritten); edits apply right after saving
 *  (event-driven fs.watch: no timer, no polling). `onChange` fires after each reload. */
export function openRoles(path: string, onChange: () => void): { current(): RoleDef[] } {
  if (!existsSync(path)) writeFileSync(path, JSON.stringify(DEFAULT_ROLES, null, 2));
  let roles = loadRoles(path);
  let debounce: NodeJS.Timeout | null = null;
  try {
    watch(dirname(path), (_event, name) => {
      if (name !== basename(path)) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { debounce = null; roles = loadRoles(path); onChange(); }, 300);
    }).on('error', (e) => appLog('warn', 'roles: watcher stopped', e));
  } catch (e) { appLog('warn', 'roles: cannot watch roles.json', e); }
  return { current: () => roles };
}

export function assignRole(agent: Agent, roles: RoleDef[]): { role?: string; color?: string; sprite?: string } {
  const name = agent.name ?? agent.id;
  for (const r of roles) {
    const byName = patternOf(r)?.test(`${agent.id} ${name}`.slice(0, MAX_MATCH_CHARS)) ?? false;
    const byCwd = r.match.cwdContains !== undefined && agent.cwd.toLowerCase().includes(r.match.cwdContains.toLowerCase());
    if (byName || byCwd) return { role: r.role, color: r.color, ...(r.sprite ? { sprite: r.sprite } : {}) };
  }
  return {};
}

export function applyRoles(state: AppState, roles: RoleDef[]): AppState {
  if (!roles.length) return state;
  return { ...state, agents: Object.fromEntries(Object.entries(state.agents).map(([id, a]) => [id, { ...a, ...assignRole(a, roles) }])) };
}

