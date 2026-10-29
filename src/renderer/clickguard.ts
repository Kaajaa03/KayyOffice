/** A card only accepts clicks once it has been visible for ARM_DELAY_MS, so a double click or a
 *  click meant for the window underneath can never approve a request the user has not read. */
export const ARM_DELAY_MS = 600;

interface Target { id: string; decision: 'allow' | 'deny' }
const key = (t: Target) => `${t.id}:${t.decision}`;

export class ClickGuard {
  private shownId: string | null = null;
  private shownAt = 0;
  private downKey: string | null = null;

  private delay = ARM_DELAY_MS;

  /** `delayMs` lets risky requests demand a longer look before they can be clicked. */
  show(id: string | null, now: number, delayMs = ARM_DELAY_MS): void {
    if (id === this.shownId) return;
    this.shownId = id;
    this.shownAt = now;
    this.delay = delayMs;
    this.downKey = null;
  }

  private armed(id: string, now: number): boolean {
    return id === this.shownId && now - this.shownAt >= this.delay;
  }

  down(t: Target | null, now: number): void {
    this.downKey = t && this.armed(t.id, now) ? key(t) : null;
  }

  up(t: Target | null, now: number): Target | null {
    const k = this.downKey;
    this.downKey = null;
    return t && k === key(t) && this.armed(t.id, now) ? t : null;
  }
}
