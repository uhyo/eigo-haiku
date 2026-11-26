/**
 * Hepburn romaji → katakana, for Japanese words written in English (sushi, kawaii, tsundere).
 * Only strict Hepburn is accepted, so that fewer English words parse by accident.
 */

const ROWS: Record<string, string[]> = {
  '': ['ア', 'イ', 'ウ', 'エ', 'オ'],
  k: ['カ', 'キ', 'ク', 'ケ', 'コ'],
  g: ['ガ', 'ギ', 'グ', 'ゲ', 'ゴ'],
  s: ['サ', '', 'ス', 'セ', 'ソ'],
  z: ['ザ', '', 'ズ', 'ゼ', 'ゾ'],
  t: ['タ', '', '', 'テ', 'ト'],
  d: ['ダ', '', '', 'デ', 'ド'],
  n: ['ナ', 'ニ', 'ヌ', 'ネ', 'ノ'],
  h: ['ハ', 'ヒ', '', 'ヘ', 'ホ'],
  b: ['バ', 'ビ', 'ブ', 'ベ', 'ボ'],
  p: ['パ', 'ピ', 'プ', 'ペ', 'ポ'],
  m: ['マ', 'ミ', 'ム', 'メ', 'モ'],
  y: ['ヤ', '', 'ユ', '', 'ヨ'],
  r: ['ラ', 'リ', 'ル', 'レ', 'ロ'],
  w: ['ワ', '', '', '', 'ヲ'],
};

const TABLE = new Map<string, string>();
for (const [c, kana] of Object.entries(ROWS)) {
  [...'aiueo'].forEach((v, i) => {
    if (kana[i]) TABLE.set(c + v, kana[i]!);
  });
}
const IRREGULAR: Record<string, string> = { shi: 'シ', chi: 'チ', tsu: 'ツ', fu: 'フ', ji: 'ジ' };
for (const [k, v] of Object.entries(IRREGULAR)) TABLE.set(k, v);
const YOON: Record<string, string> = {
  ky: 'キ', gy: 'ギ', ny: 'ニ', hy: 'ヒ', by: 'ビ', py: 'ピ', my: 'ミ', ry: 'リ', sh: 'シ', ch: 'チ', j: 'ジ',
};
const SMALL_Y: Record<string, string> = { a: 'ャ', u: 'ュ', o: 'ョ' };
for (const [c, head] of Object.entries(YOON)) {
  for (const [v, small] of Object.entries(SMALL_Y)) TABLE.set(c + v, head + small);
}
TABLE.set('she', 'シェ');
TABLE.set('che', 'チェ');
TABLE.set('je', 'ジェ');

const VOWELS = new Set('aiueo');

/** Katakana for a romaji word, or null when it is not valid Hepburn */
export function romajiToKana(word: string): string | null {
  const s = word.toLowerCase();
  if (!/^[a-z']+$/.test(s)) return null;
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    const next = s[i + 1];
    if (c === "'") {
      i++;
      continue;
    }
    // ん: n before a consonant, an apostrophe or the end; m before b, p, m (shimbun)
    if ((c === 'n' && (next === undefined || next === "'" || (!VOWELS.has(next) && next !== 'y'))) ||
      (c === 'm' && next !== undefined && 'bpm'.includes(next))) {
      out += 'ン';
      i++;
      continue;
    }
    // っ: doubled consonant, or t before ch (matcha)
    if (!VOWELS.has(c) && (next === c || (c === 't' && s.startsWith('ch', i + 1)))) {
      out += 'ッ';
      i++;
      continue;
    }
    let matched = false;
    for (const len of [3, 2, 1]) {
      const kana = TABLE.get(s.slice(i, i + len));
      if (kana) {
        out += kana;
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) return null;
  }
  return out || null;
}
