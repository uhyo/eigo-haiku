/**
 * English readings of numbers in katakana: 21 → トゥエンティワン, 2026 → トゥエンティトゥエンティシックス,
 * 3rd → サード, 3.14 → スリーポイントワンフォー.
 */

export interface NumberReading {
  kana: string;
  cost: number;
}

/** One word of the reading, with its alternatives (most natural first; '' means the word may be dropped) */
type Slot = string[];

const ONES: Slot[] = [
  ['ゼロ'],
  ['ワン'],
  ['ツー', 'トゥー'],
  ['スリー'],
  ['フォー'],
  ['ファイブ'],
  ['シックス'],
  ['セブン'],
  ['エイト'],
  ['ナイン'],
  ['テン'],
  ['イレブン'],
  ['トゥエルブ'],
  ['サーティーン', 'サーティン'],
  ['フォーティーン', 'フォーティン'],
  ['フィフティーン', 'フィフティン'],
  ['シックスティーン', 'シックスティン'],
  ['セブンティーン', 'セブンティン'],
  ['エイティーン', 'エイティン'],
  ['ナインティーン', 'ナインティン'],
];

const TENS: Slot[] = [
  [],
  [],
  ['トゥエンティ', 'トゥエンティー'],
  ['サーティー', 'サーティ'],
  ['フォーティー', 'フォーティ'],
  ['フィフティー', 'フィフティ'],
  ['シックスティー', 'シックスティ'],
  ['セブンティー', 'セブンティ'],
  ['エイティー', 'エイティ'],
  ['ナインティー', 'ナインティ'],
];

const HUNDRED: Slot = ['ハンドレッド'];
const THOUSAND: Slot = ['サウザンド'];
const MILLION: Slot = ['ミリオン'];
/** British "one hundred and five"; dropping it is the default */
const AND: Slot = ['', 'アンド'];
/** "hundred" or "one hundred" for exactly 100 */
const ONE_OPTIONAL: Slot = ['', 'ワン'];
const DIGIT_ZERO: Slot = ['ゼロ', 'オー'];

const ALT_COST = 0.5;
const MAX_COMBOS = 24;

function below100(n: number): Slot[] {
  if (n < 20) return [ONES[n]!];
  const t = TENS[Math.floor(n / 10)]!;
  return n % 10 ? [t, ONES[n % 10]!] : [t];
}

function below1000(n: number): Slot[] {
  if (n < 100) return below100(n);
  const h = Math.floor(n / 100);
  const r = n % 100;
  const out: Slot[] = [ONES[h]!, HUNDRED];
  if (r) out.push(AND, ...below100(r));
  return out;
}

/** "twenty-one", "one thousand two hundred" ... or null when the number is too large */
function cardinal(n: number): Slot[] | null {
  if (n === 100) return [ONE_OPTIONAL, HUNDRED];
  if (n === 1000) return [ONE_OPTIONAL, THOUSAND];
  if (n < 1000) return below1000(n);
  if (n < 1_000_000) {
    const th = Math.floor(n / 1000);
    const r = n % 1000;
    const out = [...below1000(th), THOUSAND];
    if (r) out.push(...(r < 100 ? [AND] : []), ...below1000(r));
    return out;
  }
  if (n < 1_000_000_000) {
    const m = Math.floor(n / 1_000_000);
    const r = n % 1_000_000;
    const rest = r ? cardinal(r) : [];
    return [...below1000(m), MILLION, ...(rest ?? [])];
  }
  return null;
}

/** Years read in pairs: 1999 → nineteen ninety-nine, 2026 → twenty twenty-six, 1905 → nineteen oh five */
function year(n: number): Slot[] | null {
  if (n < 1100 || n > 2099) return null;
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  if (hi % 10 === 0 && lo < 10) return null; // 2000–2009 are read as plain numbers
  if (lo === 0) return [...below100(hi), HUNDRED];
  if (lo < 10) return [...below100(hi), ['オー'], ONES[lo]!];
  return [...below100(hi), ...below100(lo)];
}

const digits = (s: string): Slot[] => [...s].map((d) => (d === '0' ? DIGIT_ZERO : ONES[Number(d)]!));

/** Every way to fill the slots, cheapest first */
function expand(slots: Slot[], base = 0): NumberReading[] {
  let acc: NumberReading[] = [{ kana: '', cost: base }];
  for (const slot of slots) {
    const next: NumberReading[] = [];
    for (const a of acc) slot.forEach((k, i) => next.push({ kana: a.kana + k, cost: a.cost + i * ALT_COST }));
    next.sort((x, y) => x.cost - y.cost);
    acc = next.slice(0, MAX_COMBOS);
  }
  return acc;
}

function merge(...lists: NumberReading[][]): NumberReading[] {
  const out = new Map<string, number>();
  for (const list of lists) {
    for (const r of list) {
      if (!r.kana) continue;
      const c = out.get(r.kana);
      if (c === undefined || r.cost < c) out.set(r.kana, r.cost);
    }
  }
  return [...out].map(([kana, cost]) => ({ kana, cost })).sort((a, b) => a.cost - b.cost);
}

/** Readings of a string of digits such as "21", "007" or "2026" */
export function readInteger(s: string): NumberReading[] {
  // Digit by digit is a fallback (404 → フォーゼロフォー); keep only its two most natural forms
  const bySpelling = expand(digits(s), s.length > 1 ? 1.5 : 0).slice(0, 2);
  if (s.length > 1 && s.startsWith('0')) return bySpelling; // 007, 0120
  const n = Number(s);
  const asYear = year(n);
  const asCardinal = cardinal(n);
  return merge(
    asYear ? expand(asYear) : [],
    asCardinal ? expand(asCardinal, asYear ? 0.7 : 0) : [],
    bySpelling,
  );
}

const ORDINAL: Record<string, string> = {
  ワン: 'ファースト',
  ツー: 'セカンド',
  トゥー: 'セカンド',
  スリー: 'サード',
  ファイブ: 'フィフス',
  エイト: 'エイス',
  ナイン: 'ナインス',
  トゥエルブ: 'トゥエルフス',
};

function ordinalOf(word: string): string {
  if (ORDINAL[word]) return ORDINAL[word];
  // twenty → twentieth
  if (/ティー?$/.test(word)) return word.replace(/ティー?$/, 'ティエス');
  return word + 'ス';
}

/** 1st, 2nd, 23rd, 100th */
export function readOrdinal(s: string): NumberReading[] {
  const n = Number(s);
  const slots = cardinal(n);
  if (!slots) return [];
  const last = slots[slots.length - 1]!;
  return expand([...slots.slice(0, -1), last.map(ordinalOf)]);
}

/** 3.14 → スリーポイントワンフォー */
export function readDecimal(intPart: string, frac: string): NumberReading[] {
  const head = readInteger(intPart).slice(0, 3);
  const tail = expand(digits(frac));
  return merge(
    head.flatMap((h) => tail.slice(0, 4).map((t) => ({ kana: `${h.kana}ポイント${t.kana}`, cost: h.cost + t.cost }))),
  );
}

/** Readings of a number token, or null when the token is not a number */
export function readNumber(text: string): NumberReading[] | null {
  let m: RegExpMatchArray | null;
  if (/^\d+$/.test(text)) return readInteger(text);
  if (/^\d{1,3}(,\d{3})+$/.test(text)) return readInteger(text.replace(/,/g, ''));
  if ((m = text.match(/^(\d+)(st|nd|rd|th)$/i))) return readOrdinal(m[1]!);
  if ((m = text.match(/^(\d+)\.(\d+)$/))) return readDecimal(m[1]!, m[2]!);
  return null;
}
