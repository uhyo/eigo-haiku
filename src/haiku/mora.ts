const SMALL = new Set('ァィゥェォャュョヮヵヶ');

/** Converts hiragana to katakana, leaving everything else untouched */
export function toKatakana(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[〜~]/g, 'ー');
}

/**
 * Splits a reading into morae.
 * Small kana join the previous mora; ッ, ン and ー each count as one.
 * Punctuation such as ・ is not counted.
 */
export function morae(kana: string): string[] {
  const out: string[] = [];
  for (const c of toKatakana(kana)) {
    if (SMALL.has(c) && out.length) out[out.length - 1] += c;
    // ・ and ゠ are punctuation, not morae
    else if (/[ァ-ヺー-ヾ]/.test(c)) out.push(c);
  }
  return out;
}

export const moraCount = (kana: string): number => morae(kana).length;
