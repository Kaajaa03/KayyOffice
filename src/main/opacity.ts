// Overlay transparency: 0.5-1.0 in 0.05 steps (below 0.5 the permission card would become hard to read).
export const MIN_OPACITY = 0.5;
export const MAX_OPACITY = 1;
const DEFAULT_OPACITY = 1;

export function clampOpacity(v: number): number {
  const stepped = Math.round(v * 20) / 20;
  return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, stepped));
}

export function parseOpacity(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? clampOpacity(v) : DEFAULT_OPACITY;
}
