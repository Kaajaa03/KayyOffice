export interface ModelChip { letter: string; color: string }

const FAMILIES: Array<[RegExp, ModelChip]> = [
  [/haiku/i, { letter: 'H', color: '#38d9a9' }],
  [/sonnet/i, { letter: 'S', color: '#4dabf7' }],
  [/opus/i, { letter: 'O', color: '#f783ac' }],
  [/fable/i, { letter: 'F', color: '#ffd43b' }],
];

export function modelChip(model?: string): ModelChip | null {
  if (!model) return null;
  for (const [re, chip] of FAMILIES) if (re.test(model)) return chip;
  return { letter: '?', color: '#9ca3af' };
}

export function formatCost(usd: number): string {
  return usd > 0 && usd < 0.01 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
}
