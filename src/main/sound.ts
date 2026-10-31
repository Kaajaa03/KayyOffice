// Opt-in signal: one beep when an agent starts waiting for the person (not while it keeps waiting).
import type { AppState } from '../shared/types';

export class AttentionSound {
  private waiting = new Set<string>();

  constructor(private beep: () => void, private enabled = false) {}

  setEnabled(on: boolean): void { this.enabled = on; }

  update(live: AppState): void {
    const now = new Set(Object.values(live.agents).filter((a) => a.status === 'waiting').map((a) => a.id));
    const fresh = [...now].some((id) => !this.waiting.has(id));
    this.waiting = now;
    if (fresh && this.enabled) this.beep();
  }
}
