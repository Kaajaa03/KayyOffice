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
