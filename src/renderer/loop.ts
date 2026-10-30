import { isWalking } from './walk';
import type { Agent } from '../shared/types';

/**
 * fast = an agent is working or walking (60 fps); slow = waiting/error/done without walking (10 fps timer);
 * none = static (the cached room is all there is).
 */
export function animationMode(agents: Agent[], now = Date.now()): 'fast' | 'slow' | 'none' {
  let slow = false;
  for (const a of agents) {
    if (a.status === 'working' || isWalking(a, now)) return 'fast';
    if (a.status !== 'idle') slow = true;
  }
  return slow ? 'slow' : 'none';
}

export interface FrameGateOptions {
  activeFps: number;
  idleFps: number;
}

/** Decides whether a requestAnimationFrame tick should actually paint. */
export class FrameGate {
  private last = -Infinity;
  constructor(private opts: FrameGateOptions) {}

  shouldDraw(now: number, hasAnimation: boolean, visible: boolean): boolean {
    if (!visible) return false;
    const fps = hasAnimation ? this.opts.activeFps : this.opts.idleFps;
    // 2 ms tolerance so a 60 Hz rAF (16.67 ms) is not aliased down to 30 fps
    if (now - this.last < 1000 / fps - 2) return false;
    this.last = now;
    return true;
  }
}
