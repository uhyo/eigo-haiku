import { describe, expect, test } from 'vitest';
import { readNumber } from './numbers.ts';

const best = (s: string) => readNumber(s)?.[0]?.kana;
const all = (s: string) => readNumber(s)?.map((r) => r.kana) ?? [];

describe('readNumber', () => {
  test.each([
    ['2', 'ツー'],
    ['13', 'サーティーン'],
    ['21', 'トゥエンティワン'],
    ['60', 'シックスティー'],
    ['99', 'ナインティーナイン'],
    ['100', 'ハンドレッド'],
    ['200', 'ツーハンドレッド'],
    ['105', 'ワンハンドレッドファイブ'],
    ['1000', 'サウザンド'],
    ['1,000', 'サウザンド'],
    ['2005', 'ツーサウザンドファイブ'],
    ['2026', 'トゥエンティトゥエンティシックス'],
    ['1999', 'ナインティーンナインティーナイン'],
    ['1905', 'ナインティーンオーファイブ'],
    ['1900', 'ナインティーンハンドレッド'],
    ['007', 'ゼロゼロセブン'],
    ['1st', 'ファースト'],
    ['2nd', 'セカンド'],
    ['3rd', 'サード'],
    ['4th', 'フォース'],
    ['20th', 'トゥエンティエス'],
    ['21st', 'トゥエンティファースト'],
    ['3.14', 'スリーポイントワンフォー'],
  ])('%s → %s', (s, kana) => {
    expect(best(s)).toBe(kana);
  });

  test('offers variants that change the mora count', () => {
    expect(all('21')).toContain('トゥエンティーワン');
    expect(all('100')).toContain('ワンハンドレッド');
    expect(all('105')).toContain('ワンハンドレッドアンドファイブ');
    expect(all('2026')).toContain('ツーサウザンドトゥエンティシックス');
  });

  test('digit by digit is a fallback', () => {
    expect(all('404')).toContain('フォーゼロフォー');
    expect(all('404')[0]).toBe('フォーハンドレッドフォー');
  });

  test('returns null for non-numbers', () => {
    expect(readNumber('abc')).toBeNull();
    expect(readNumber('3D')).toBeNull();
  });
});
