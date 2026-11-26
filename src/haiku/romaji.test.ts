import { describe, expect, test } from 'vitest';
import { romajiToKana } from './romaji.ts';

describe('romajiToKana', () => {
  test.each([
    ['sushi', 'スシ'],
    ['tsundere', 'ツンデレ'],
    ['kawaii', 'カワイイ'],
    ['shibuya', 'シブヤ'],
    ['konnichiwa', 'コンニチワ'],
    ['matcha', 'マッチャ'],
    ['kitto', 'キット'],
    ['shimbun', 'シンブン'],
    ["kan'i", 'カンイ'],
    ['kyoto', 'キョト'],
  ])('%s → %s', (word, kana) => {
    expect(romajiToKana(word)).toBe(kana);
  });

  test.each(['time', 'street', 'level', 'cat', 'si', 'tu'])('%s is not Hepburn', (word) => {
    expect(romajiToKana(word)).toBeNull();
  });
});
