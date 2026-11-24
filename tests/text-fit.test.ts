import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fit, measure } from '../src/renderer/text';
import { wrapLines } from '../src/renderer/card';

// node env has no canvas: narrow/wide letters make widths uneven but still monotone per prefix
const W = (ch: string) => (ch === 'i' || ch === ' ' ? 3 : ch === 'W' ? 11 : 6);
let calls = 0;
beforeAll(() => {
  vi.stubGlobal('document', {
    createElement: () => ({ getContext: () => ({ font: '', measureText: (t: string) => { calls++; return { width: [...t].reduce((a, c) => a + W(c), 0) }; } }) }),
  });
});

const FONT = 'f';
// the previous linear implementations, kept as reference
const fitLinear = (text: string, max: number, min = 2): string => {
  let t = text;
  while (t.length > min && measure(t, FONT) > max) t = t.replace(/…$/, '').slice(0, -1) + '…';
  return t;
};
const wrapLinear = (text: string, max: number, maxLines: number): string[] => {
  const lines: string[] = [];
  let rest = text.trim();
  while (rest && lines.length < maxLines) {
    if (measure(rest, FONT) <= max) { lines.push(rest); rest = ''; break; }
    let cut = rest.length;
    while (cut > 1 && measure(rest.slice(0, cut), FONT) > max) cut--;
    const space = rest.lastIndexOf(' ', cut);
    if (space > cut / 2) cut = space;
    lines.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) lines[lines.length - 1] = fitLinear(lines[lines.length - 1] + ' ' + rest, max, 1);
  return lines;
};

const samples = ['', 'a', 'ab', 'abc', 'Hello World this is a longer text with iii and WWW inside', 'WWWWWWWWWWWWWWWW', 'iiiiiiiiiiiiiiiiiiii', 'ends with ellipsis…', 'x…', 'word '.repeat(30)];

describe('fit', () => {
  it('matches the linear reference for many widths and minimums', () => {
    for (const s of samples) for (const min of [1, 2, 4]) for (let max = 0; max <= 200; max += 7) {
      expect(fit(s, FONT, max, min), `${s}|${max}|${min}`).toBe(fitLinear(s, max, min));
    }
  });
  it('min 0 never cuts into the text before the ellipsis', () => {
    expect(fit('WWWWWWWW', FONT, 0, 0)).toBe('…');
    expect(fit('WWWWWWWW', FONT, 30, 0)).toBe(fitLinear('WWWWWWWW', 30, 1));
  });
  it('needs only O(log n) measurements for a long text', () => {
    const s = 'abcdefghij'.repeat(100);
    calls = 0;
    fit(s + 'q', 'g', 100);
    expect(calls).toBeLessThan(30);
  });
});

describe('wrapLines', () => {
  it('matches the linear reference', () => {
    for (const s of samples) for (const lines of [1, 2, 3]) for (let max = 10; max <= 200; max += 13) {
      expect(wrapLines(s, FONT, max, lines), `${s}|${max}|${lines}`).toEqual(wrapLinear(s, max, lines));
    }
  });
});
