// Readings that do not depend on the e2k model
import { describe, expect, test } from 'vitest';
import { addS, readingsFor, splitParts, variants } from './readings.ts';
import { tokenize } from './tokenize.ts';

const kana = (word: string) => readingsFor(word, null).map((r) => r.kana);

describe('readingsFor without the model', () => {
  test.each([
    ['AI', 'エーアイ'],
    ['APIs', 'エーピーアイズ'],
    ['x', 'エックス'],
    ['B', 'ビー'],
    ['js', 'ジェーエス'],
    ["don't", 'ドント'],
    ["I'm", 'アイム'],
    ["it's", 'イッツ'],
    ["that's", 'ザッツ'],
    ["rock'n'roll", 'ロックンロール'],
    ['21', 'トゥエンティワン'],
    ['1st', 'ファースト'],
    ['3D', 'スリーディー'],
    ['5G', 'ファイブジー'],
    ['MP3', 'エムピースリー'],
    ['100%', 'ハンドレッドパーセント'],
    ['C++', 'シープラスプラス'],
    ['&', 'アンド'],
    ['ＡＩ', 'エーアイ'],
    ['GitHub', 'ギットハブ'],
    ['Pokémon', 'ポケモン'],
    ['café', 'カフェ'],
    ['Tokyo', 'トーキョー'],
    ['ﾚﾍﾞﾙ', 'レベル'],
  ])('%s → %s', (word, reading) => {
    expect(kana(word)[0]).toBe(reading);
  });

  test('lenient variants are offered', () => {
    expect(kana('21')).toContain('トゥエンティーワン');
    expect(kana('Tokyo')).toContain('トウキョウ');
    expect(kana('&')).toContain('エン');
  });

  test('kanji cannot be read', () => {
    expect(readingsFor('雪だるま', null)).toEqual([]);
    expect(kana('ゆきだるま')).toEqual(['ユキダルマ']);
  });

  test('readings are sorted from most natural', () => {
    const costs = readingsFor('21', null).map((r) => r.cost);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });
});

describe('variants', () => {
  test.each([
    ['サーバー', 'サーバ'],
    ['パーティ', 'パーティー'],
    ['ハロウィーン', 'ハロウィン'],
    ['ウィンター', 'ウインター'],
    ['ウェディング', 'ウエディング'],
    ['ウォーター', 'ウオーター'],
  ])('%s → %s', (from, to) => {
    expect(variants(from)).toContain(to);
  });
});

describe('addS', () => {
  test.each([
    ['キャット', 'キャッツ'],
    ['キッド', 'キッズ'],
    ['ジャック', 'ジャックス'],
    ['サンタ', 'サンタズ'],
  ])('%s → %s', (from, to) => {
    expect(addS(from)).toBe(to);
  });
});

describe('splitParts', () => {
  test.each([
    ['GitHub', ['Git', 'Hub']],
    ['iPhone15', ['i', 'Phone', '15']],
    ['HTMLParser', ['HTML', 'Parser']],
    ['3D', ['3', 'D']],
    ['Node.js', ['Node', '.', 'js']],
    ["fish'n'chips", ['fish', "'n'", 'chips']],
  ])('%s → %j', (text, parts) => {
    expect(splitParts(text)).toEqual(parts);
  });
});

describe('tokenize', () => {
  test('normalizes full-width input', () => {
    expect(tokenize('ｌｅｖｅｌ　２').tokens.map((t) => t.text)).toEqual(['level', '2']);
  });

  test('keeps symbols that are read aloud', () => {
    expect(tokenize('rock & roll, 100%!').tokens.map((t) => t.text)).toEqual(['rock', '&', 'roll', '100%']);
  });
});
