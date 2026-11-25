const SMALL = new Set('ァィゥェォャュョヮヵヶ');

/** Converts hiragana to katakana, leaving everything else untouched */
export function toKatakana(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/**
 * Splits a reading into morae.
 * Small kana join the previous mora; ッ, ン and ー each count as one.
 */
export function morae(kana: string): string[] {
  const out: string[] = [];
  for (const c of toKatakana(kana)) {
    if (SMALL.has(c) && out.length) out[out.length - 1] += c;
    else if (/[゠-ヿ]/.test(c)) out.push(c);
  }
  return out;
}

export const moraCount = (kana: string): number => morae(kana).length;
