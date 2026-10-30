export interface MouseTarget {
  isDestroyed(): boolean;
  setIgnoreMouseEvents(ignore: boolean, options?: { forward: boolean }): void;
}

/** The renderer toggles "interactive" over IPC; if it never sends the closing message (hidden
 *  window, crashed renderer, answered card) the overlay would keep swallowing clicks. */
export function resetClickThrough(win: MouseTarget | undefined): void {
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(true, { forward: true });
}

export function resetClickThroughWhenIdle(win: MouseTarget | undefined, pendingPermissions: number): void {
  if (pendingPermissions === 0) resetClickThrough(win);
}
