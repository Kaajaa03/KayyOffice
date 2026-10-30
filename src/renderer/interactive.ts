// Tracks whether main was last told "the mouse is over a clickable control". Main resets click-through on
// hide/reload; we forget our belief at the same time, or the next hover over the same spot would send nothing.
export class InteractiveSync {
  private on = false;

  /** Returns true when main has to be told (the wanted state differs from the last one sent). */
  want(on: boolean): boolean {
    const changed = on !== this.on;
    this.on = on;
    return changed;
  }

  reset(): void {
    this.on = false;
  }

  get active(): boolean {
    return this.on;
  }
}
