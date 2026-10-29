import type { RouterCounts } from '../types'

export const statusText = (counts: RouterCounts, usd: number | undefined, isOn: boolean): string => {
  const parts = [`haiku ${counts.haiku}`, `sonnet ${counts.sonnet}`, `opus ${counts.opus}`]
  if (usd !== undefined) parts.push(`$${usd.toFixed(2)}`)
  return (isOn ? '' : 'router off · ') + parts.join(' · ')
}
