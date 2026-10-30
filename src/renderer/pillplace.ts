// Pure collision handling for name pills: crowded spots (coffee machine, sofa, desks side by side)
// must not paint pills over each other.
export interface PillBox { cx: number; top: number; w: number; h: number }
interface Bounds { left: number; right: number; top: number; bottom: number }
interface PillPos { x: number; top: number }

const GAP = 1;
const MAX_STEPS = 4;

const hit = (a: PillBox, b: PillBox): boolean =>
  Math.abs(a.cx - b.cx) < (a.w + b.w) / 2 && Math.abs(a.top - b.top) < (a.h + b.h) / 2 + GAP;

/**
 * Clamps every pill into `bounds` and, in order, nudges a pill up/down in pill-height steps until it
 * no longer overlaps an already placed one. The first pill of a crowd stays where it is.
 */
export function placePills(pills: PillBox[], bounds: Bounds): PillPos[] {
  const placed: PillBox[] = [];
  return pills.map((p) => {
    const cx = Math.min(bounds.right - p.w / 2, Math.max(bounds.left + p.w / 2, p.cx));
    const fits = (top: number) => top >= bounds.top && top + p.h <= bounds.bottom;
    const base = Math.min(bounds.bottom - p.h, Math.max(bounds.top, p.top));
    let chosen = { ...p, cx, top: base };
    for (let k = 0; k <= MAX_STEPS * 2; k++) {
      const step = k % 2 ? -Math.ceil(k / 2) : Math.ceil(k / 2); // 0, -1, +1, -2, +2 ...
      const top = base + step * (p.h + GAP);
      if (!fits(top)) continue;
      const cand = { ...p, cx, top };
      if (!placed.some((o) => hit(cand, o))) { chosen = cand; break; }
    }
    placed.push(chosen);
    return { x: chosen.cx, top: chosen.top };
  });
}
