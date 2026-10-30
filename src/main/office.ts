// Live office state: reduces agent events, overlays the temporary demo, throttles publishing and
// arms one housekeeping timer for the next due moment only.
import { demoCountState, demoState } from './demo';
import { initialState, nextDueMs, pruneStale, reduce, tick } from './state';
import type { Agent, AgentEvent, AppState } from '../shared/types';

const PUBLISH_MIN_MS = 50;

interface OfficeOutput {
  /** The state to draw (demo while it runs, else the live one). */
  render(view: AppState): void;
  /** The live state changed (power, tray tooltip). */
  changed(live: AppState): void;
}

export class Office {
  private state: AppState = initialState();
  private demo: AppState | null = null;
  private demoTimer: NodeJS.Timeout | null = null;
  private publishTimer: NodeJS.Timeout | null = null;
  private publishDirty = false;
  private housekeeping: NodeJS.Timeout | null = null;

  constructor(private out: OfficeOutput) {}

  get view(): AppState { return this.demo ?? this.state; }

  agent(id: string): Agent | undefined { return this.state.agents[id]; }

  apply(e: AgentEvent): void {
    this.state = reduce(this.state, e);
    this.syncHousekeeping();
    this.publish();
  }

  /** Sample office (`count` > 0: that many agents) for `ms`, or until replaced when `ms` is null. */
  startDemo(count: number, ms: number | null): void {
    this.demo = count ? demoCountState(count) : demoState();
    if (this.demoTimer) clearTimeout(this.demoTimer);
    this.demoTimer = null;
    this.publish();
    if (ms) this.demoTimer = setTimeout(() => { this.demo = null; this.demoTimer = null; this.publish(); }, ms);
  }

  publish(): void {
    this.out.changed(this.state);
    if (this.publishTimer) { this.publishDirty = true; return; }
    this.out.render(this.view);
    this.publishTimer = setTimeout(() => {
      this.publishTimer = null;
      if (this.publishDirty) { this.publishDirty = false; this.publish(); }
    }, PUBLISH_MIN_MS);
  }

  /** One timer for the next moment tick/pruneStale have work; none when nothing is due. */
  private syncHousekeeping(): void {
    if (this.housekeeping) clearTimeout(this.housekeeping);
    this.housekeeping = null;
    const delay = nextDueMs(this.state, Date.now());
    if (delay === null) return;
    this.housekeeping = setTimeout(() => {
      this.housekeeping = null;
      const now = Date.now();
      const next = pruneStale(tick(this.state, now), now);
      if (next !== this.state) { this.state = next; this.publish(); }
      this.syncHousekeeping();
    }, delay);
  }
}
