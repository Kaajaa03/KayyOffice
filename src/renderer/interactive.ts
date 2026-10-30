/** Tracks whether the renderer last told main "the mouse is over a clickable control".
 *  Main resets click-through on hide/reload; the renderer must forget its belief at the same
 *  moment, otherwise the next hover over the same spot sends no message and the click falls
 *  through to the window underneath. */
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
