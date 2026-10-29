import type { RouterCounts } from '../types'

/** Status line: only models that were actually routed (no row of zeros), plus the session cost. */
export const statusText = (counts: RouterCounts, usd: number | undefined, isOn: boolean): string => {
  const routed = (['haiku', 'sonnet', 'opus'] as const)
    .filter((m) => counts[m] > 0)
    .map((m) => `${m} ${counts[m]}`)
  const parts = [...routed]
  if (usd !== undefined) parts.push(`$${usd.toFixed(2)}`)
  const lead = isOn ? (routed.length ? [] : ['Router bereit']) : ['Router aus']
  return [...lead, ...parts].join(' · ')
}
