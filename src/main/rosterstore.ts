// The waiting area (available agent types) survives an overlay restart: the mod only re-sends it when a session offers agents.
import { readFileSync } from 'node:fs';
import { writeFileAtomic } from './fsutil';
import { parseRoster } from './validate';
import type { RosterEntry } from '../shared/types';

/** The saved roster, or undefined when there is none or the file is unreadable. */
export function loadRoster(file: string): RosterEntry[] | undefined {
  try { return parseRoster(JSON.parse(readFileSync(file, 'utf8'))); } catch { return undefined; }
}

export function saveRoster(file: string, roster: RosterEntry[]): void {
  try { writeFileAtomic(file, JSON.stringify(roster)); } catch { /* a missing roster file only means an empty waiting area */ }
}
