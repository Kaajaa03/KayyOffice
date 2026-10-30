import type { AgentEvent, PermissionPayload } from '../shared/types';

const MOD_FRESH_MS = 5 * 60_000;

/** The Claude mod is preferred over classic hooks: while it reports for a session, that
 *  session's hook events and hook permission requests are ignored (no double counting/cards). */
export class SourceGate {
  private modSeen = new Map<string, number>(); // sessionId -> last mod event (ms)

  constructor(private now: () => number = Date.now) {}

  private sessionIsMod(sessionId: string): boolean {
    const t = this.modSeen.get(sessionId);
    if (t === undefined) return false;
    if (this.now() - t > MOD_FRESH_MS) { this.modSeen.delete(sessionId); return false; }
    return true;
  }

  /** True while any session reported through the Claude mod within the last 5 minutes (settings status). */
  modActive(): boolean {
    return [...this.modSeen.keys()].some((id) => this.sessionIsMod(id));
  }

  acceptEvent(e: AgentEvent): boolean {
    if (e.source === 'mod') { this.modSeen.set(e.sessionId, this.now()); return true; }
    return !this.sessionIsMod(e.sessionId);
  }

  acceptPermission(p: Pick<PermissionPayload, 'sessionId' | 'source'>): boolean {
    if (p.source === 'mod') { this.modSeen.set(p.sessionId, this.now()); return true; } // mod is alive even if its events were dropped
    return !this.sessionIsMod(p.sessionId);
  }
}
