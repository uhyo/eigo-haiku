// End-to-end checks with the real e2k model
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, test } from 'vitest';
import { E2K } from '../e2k/model.ts';
import { moraCount } from './mora.ts';
import { readingsFor } from './readings.ts';
import { solve575 } from './solver.ts';
import { tokenize } from './tokenize.ts';

let model: E2K;

beforeAll(() => {
  const buf = readFileSync(new URL('../../public/model-c2k.safetensors', import.meta.url));
  model = new E2K(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
});

function judge(input: string) {
  const { tokens, manual } = tokenize(input);
  const words = tokens.map((t) => {
    const readings = readingsFor(t.text, model).map((r) => ({ ...r, mora: moraCount(r.kana) }));
    return { ...t, readings, options: readings };
  });
  const r = solve575(words, manual);
  if (!r) return null;
  return [0, 1, 2].map((line) =>
    words.map((w, i) => (r.split[i] === line ? w.readings[r.choice[i]!]!.kana : '')).join(''),
  );
}

describe('e2k model', () => {
  test.each([
    ['level', 'レベル'],
    ['island', 'アイランド'],
    ['starbucks', 'スターバックス'],
    ['server', 'サーバー'],
  ])('reads %s as %s', (word, kana) => {
    expect(model.candidates(word)[0]?.kana).toBe(kana);
  });
});

describe('judge', () => {
  test.each([
    ['level 2 ice cream island', ['レベルツー', 'アイスクリーム', 'アイランド']],
    ['Christmas\nSanta Claus\npresent', ['クリスマス', 'サンタクラウス', 'プレゼント']],
    ['Friday server down sunrise', ['フライデー', 'サーバーダウン', 'サンライズ']],
    ['spring Starbucks street', ['スプリング', 'スターバックス', 'ストリート']],
    ['Halloween ghost party pumpkin', ['ハロウィーン', 'ゴーストパーティ', 'パンプキン']],
  ])('%j is 5-7-5', (input, lines) => {
    expect(judge(input)).toEqual(lines);
  });

  test('reads acronyms letter by letter', () => {
    expect(readingsFor('AI', model)[0]?.kana).toBe('エーアイ');
  });

  test('rejects a haiku that is too long', () => {
    expect(judge('old pond frog jumps in water sound')).toBeNull();
  });
});
