import { describe, expect, test } from 'vitest';
import { fallbackLayout, solve575, type Word } from './solver.ts';

const w = (morae: number[], line: number | null = null): Word => ({
  line,
  options: morae.map((mora, i) => ({ mora, cost: i })),
});

describe('solve575', () => {
  test('finds line breaks automatically', () => {
    // level(3) 2(2) / ice(3) cream(4) / island(5)
    const r = solve575([w([3]), w([2]), w([3]), w([4]), w([5])], false);
    expect(r?.split).toEqual([0, 0, 1, 1, 2]);
  });

  test('prefers the cheapest readings', () => {
    // Halloween: 4 (cost 0) or 5 (cost 1); ghost 4; party 4 (cost 0) or 3 (cost 1); pumpkin 5
    const r = solve575([w([4, 5]), w([4]), w([4, 3]), w([5])], false);
    expect(r?.choice).toEqual([1, 0, 1, 0]);
  });

  test('respects manual line breaks', () => {
    // 5 / 3+4 / 5 fits, but the user put the break after the 3
    const words = [w([5], 0), w([3], 1), w([4], 2), w([5], 2)];
    expect(solve575(words, true)).toBeNull();
    expect(solve575([w([5], 0), w([3], 1), w([4], 1), w([5], 2)], true)?.ok).toBe(true);
  });

  test('returns null when 17 morae cannot be split at word boundaries', () => {
    expect(solve575([w([4]), w([4]), w([4]), w([5])], false)).toBeNull();
  });

  test('returns null for no words', () => {
    expect(solve575([], false)).toBeNull();
  });
});

describe('fallbackLayout', () => {
  test('moves to the next line instead of overshooting', () => {
    const r = fallbackLayout([w([4]), w([3]), w([5]), w([4])], false);
    expect(r.ok).toBe(false);
    expect(r.split).toEqual([0, 1, 2, 2]);
  });
});
