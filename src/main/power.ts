import type { AppState } from '../shared/types';

export interface Blocker {
  start(type: 'prevent-app-suspension' | 'prevent-display-sleep'): number;
  stop(id: number): void;
}

const GRACE_MS = 60_000;

/** Keeps Windows awake while any agent is working or waiting. */
export class AwakeManager {
  private id: number | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled: boolean;

  constructor(private blocker: Blocker, opts: { enabled?: boolean } = {}) {
    this.enabled = opts.enabled ?? true;
  }

  update(state: AppState): void {
    // 'waiting' = needs the user, not computing: must not hold the PC awake for hours
    const active = Object.values(state.agents).some((a) => a.status === 'working');
    if (active) {
      this.cancelStop();
      if (this.enabled && this.id === null) this.id = this.blocker.start('prevent-app-suspension');
    } else if (this.id !== null && !this.stopTimer) {
      this.stopTimer = setTimeout(() => this.release(), GRACE_MS);
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.release();
  }

  private cancelStop(): void {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
  }

  private release(): void {
    this.cancelStop();
    if (this.id !== null) this.blocker.stop(this.id);
    this.id = null;
  }
}
