import { describe, expect, test } from 'vitest';
import { moraCount, morae, toKatakana } from './mora.ts';

describe('morae', () => {
  test.each([
    ['レベルツー', 5],
    ['アイスクリーム', 7],
    ['アイランド', 5],
    ['スターバックス', 7],
    ['ハロウィーン', 5],
    ['ハロウィン', 4],
    ['ハロウイン', 5],
    ['チョコレート', 5],
    ['ジャバスクリプト', 7],
  ])('%s has %i morae', (kana, n) => {
    expect(moraCount(kana)).toBe(n);
  });

  test('small kana join the previous mora', () => {
    expect(morae('パーティー')).toEqual(['パ', 'ー', 'ティ', 'ー']);
  });

  test('punctuation is not counted', () => {
    expect(moraCount('サンタ・クロース')).toBe(7);
    expect(moraCount('ら〜めん')).toBe(4);
  });

  test('hiragana is accepted', () => {
    expect(toKatakana('れべる')).toBe('レベル');
    expect(moraCount('きゃっと')).toBe(3);
  });
});
