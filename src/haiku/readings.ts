import type { Candidate } from '../e2k/model.ts';
import { DICT, SPELL, SYMBOLS } from './dictionary.ts';
import { moraCount, toKatakana } from './mora.ts';
import { readNumber } from './numbers.ts';
import { romajiToKana } from './romaji.ts';

export type ReadingSource =
  | 'kana'
  | 'dict'
  | 'spell'
  | 'number'
  | 'model'
  | 'romaji'
  | 'compound'
  | 'variant'
  | 'lock';

export interface Reading {
  kana: string;
  /** Lower is more natural; the solver minimizes the total */
  cost: number;
  source: ReadingSource;
}

/** Anything that can propose katakana readings for an English word */
export interface Reader {
  candidates(word: string): Candidate[];
}

/** Minimum probability for a model candidate other than the best one */
const MIN_PROB = 0.04;
/** When the dictionary already has the word, only confident model readings are added */
const MIN_PROB_WITH_DICT = 0.2;
/** Romaji is tried only when the model is unsure of the English reading */
const ROMAJI_MAX_MODEL_PROB = 0.5;
const ROMAJI_COST = 1;
const VARIANT_COST = 1.5;
/** Extra cost for reading a word piece by piece (GitHub → ギット＋ハブ) */
const COMPOUND_COST = 0.2;
/** Extra cost for a word read without its apostrophe (dont → ドント) */
const NO_APOSTROPHE_COST = 0.3;
const POSSESSIVE_COST = 0.2;
const MAX_READINGS = 10;
const PART_READINGS = 3;
const MAX_COMBOS = 12;

/** Common spelling variants that change the mora count */
export function variants(kana: string): string[] {
  const out: string[] = [];
  // サーバー → サーバ
  if (kana.length > 2 && kana.endsWith('ー')) out.push(kana.slice(0, -1));
  // パーティ → パーティー
  if (kana.length > 1 && kana.endsWith('ィ')) out.push(kana + 'ー');
  // ハロウィーン → ハロウィン
  const shortened = kana.replace(/ィー/g, 'ィ');
  if (shortened !== kana) out.push(shortened);
  // ウィ・ウェ・ウォ (1 mora) ⇔ ウイ・ウエ・ウオ (2 morae)
  for (const [one, two] of [
    ['ウィ', 'ウイ'],
    ['ウェ', 'ウエ'],
    ['ウォ', 'ウオ'],
  ] as const) {
    if (kana.includes(one)) out.push(kana.replaceAll(one, two));
    if (kana.includes(two)) out.push(kana.replaceAll(two, one));
  }
  return out;
}

class Readings {
  readonly items: Reading[] = [];
  add(kana: string, cost: number, source: ReadingSource) {
    if (!kana) return;
    const ex = this.items.find((x) => x.kana === kana);
    if (!ex) this.items.push({ kana, cost, source });
    else if (cost < ex.cost) Object.assign(ex, { cost, source });
  }
  get size() {
    return this.items.length;
  }
}

/** café → cafe, ｌｅｖｅｌ → level, ’ → ' */
export function normalizeWord(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .normalize('NFD')
    .replace(/([A-Za-z])\p{M}+/gu, '$1')
    .normalize('NFC');
}

const spell = (letters: string) => [...letters.toLowerCase()].map((c) => SPELL[c] ?? '').join('');
const isLetters = (s: string) => /^[a-z']+$/i.test(s);

/** Plural or possessive s: cat's → キャッツ, kid's → キッズ, Santa's → サンタズ */
export function addS(kana: string): string {
  if (kana.endsWith('ト')) return kana.slice(0, -1) + 'ツ';
  if (kana.endsWith('ド')) return kana.slice(0, -1) + 'ズ';
  if (/[クプフ]$/.test(kana)) return kana + 'ス';
  return kana + 'ズ';
}

/** Readings of one run of letters (with apostrophes), without splitting it */
function wordReadings(text: string, reader: Reader | null, out = new Readings()): Readings {
  const lower = text.toLowerCase();
  DICT[lower]?.forEach((k, i) => out.add(k, i * 0.7, 'dict'));
  if (out.size) {
    if (lower.length > 1 && !lower.includes("'")) addModel(lower, reader, out, 1.2);
    return out;
  }

  // Quotes around a word: 'hello'
  const core = lower.replace(/^'+|'+$/g, '');
  if (!core) return out;
  if (core !== lower) return wordReadings(text.replace(/^'+|'+$/g, ''), reader, out);

  // Acronyms: AI → エーアイ, APIs → エーピーアイズ
  const acronym = text.match(/^([A-Z]{2,7})('?s)?$/);
  if (acronym) {
    out.add(spell(acronym[1]!) + (acronym[2] ? 'ズ' : ''), 0, 'spell');
    if (!acronym[2]) addModel(lower, reader, out, 1.2);
    return out;
  }

  // Single letters: x → エックス
  if (core.length === 1) {
    out.add(spell(core), 0, 'spell');
    return out;
  }

  // Words with no vowels are usually letters: js → ジェーエス, npm → エヌピーエム
  if (/^[^aeiouy']{2,6}$/.test(core)) out.add(spell(core), 0.3, 'spell');

  // Possessive and contracted s: Santa's, it's, let's
  const poss = core.match(/^(.+)'s$/);
  if (poss) {
    const base = wordReadings(text.slice(0, -2), reader).items.sort((a, b) => a.cost - b.cost);
    for (const r of base.slice(0, 4)) out.add(addS(r.kana), r.cost + POSSESSIVE_COST, r.source);
    return out;
  }

  if (core.includes("'")) {
    addModel(core.replace(/'/g, ''), reader, out, NO_APOSTROPHE_COST);
    return out;
  }

  const confidence = addModel(core, reader, out, out.size ? 1.2 : 0);
  if (confidence < ROMAJI_MAX_MODEL_PROB) {
    const kana = romajiToKana(core);
    if (kana) out.add(kana, ROMAJI_COST, 'romaji');
  }
  return out;
}

/** Adds model readings and returns the probability of the best one (0 without a model) */
function addModel(word: string, reader: Reader | null, out: Readings, base: number): number {
  if (!reader) return 0;
  const cands = reader.candidates(word);
  const best = cands[0]?.kana ?? '';
  const minProb = base ? MIN_PROB_WITH_DICT : MIN_PROB;
  cands.forEach((c, i) => {
    const p = Math.exp(c.logp);
    if ((i > 0 || base) && p < minProb) return;
    // Truncated beams (a prefix of the best reading) are usually junk
    if (i > 0 && best.startsWith(c.kana) && best !== c.kana + 'ー') return;
    out.add(c.kana, base + Math.max(0, -Math.log(p)), 'model');
  });
  return cands[0] ? Math.exp(cands[0].logp) : 0;
}

/**
 * Splits a token into pieces read one by one:
 * GitHub → Git Hub, iPhone15 → i Phone 15, 3D → 3 D, Node.js → Node . js, C++ → C + +
 */
export function splitParts(text: string): string[] {
  return text
    .split(/('n')/i)
    .flatMap((piece) =>
      piece.toLowerCase() === "'n'"
        ? [piece]
        : (piece.match(/[A-Z]{2,}(?![a-z])|[A-Z]?[a-z']+|[A-Z]|\d+(?:[.,]\d+)*(?:st|nd|rd|th)?|[^A-Za-z\d]/g) ?? []),
    )
    .filter(Boolean);
}

function partReadings(
  part: string,
  prev: string | undefined,
  next: string | undefined,
  reader: Reader | null,
): Reading[] | null {
  const sym = SYMBOLS[part];
  if (part === '.') {
    // Node.js → ノードジェーエス or ノードドットジェーエス
    const between = prev && next && isLetters(prev) && isLetters(next);
    return between ? sym!.map((kana, i) => ({ kana, cost: i * 0.8, source: 'dict' as const })) : [];
  }
  if (sym) return sym.map((kana, i) => ({ kana, cost: i * 0.5, source: 'dict' as const }));
  const num = readNumber(part);
  if (num) return num.map((r) => ({ ...r, source: 'number' as const }));
  if (isLetters(part)) return wordReadings(part, reader).items;
  // Other symbols inside a word are skipped
  if (!/[\p{L}\p{N}]/u.test(part)) return [];
  return null;
}

function compoundReadings(text: string, reader: Reader | null, out: Readings) {
  const parts = splitParts(text);
  if (parts.length < 2) return;
  let acc: { kana: string; cost: number }[] = [{ kana: '', cost: COMPOUND_COST }];
  for (const [i, part] of parts.entries()) {
    const rs = partReadings(part, parts[i - 1], parts[i + 1], reader);
    if (rs === null || (!rs.length && /[\p{L}\p{N}]/u.test(part))) return;
    if (!rs.length) continue;
    const top = [...rs].sort((a, b) => a.cost - b.cost).slice(0, PART_READINGS);
    acc = acc
      .flatMap((a) => top.map((r) => ({ kana: a.kana + r.kana, cost: a.cost + r.cost })))
      .sort((a, b) => a.cost - b.cost)
      .slice(0, MAX_COMBOS);
  }
  for (const a of acc) out.add(a.kana, a.cost, 'compound');
}

/** Keeps the cheapest reading of each mora count, then fills up with the cheapest of the rest */
function pick(list: Reading[]): Reading[] {
  const sorted = [...list].sort((a, b) => a.cost - b.cost);
  const picked = new Set<Reading>();
  const counts = new Set<number>();
  for (const r of sorted) {
    const m = moraCount(r.kana);
    if (!counts.has(m)) {
      counts.add(m);
      picked.add(r);
    }
  }
  for (const r of sorted) if (picked.size < MAX_READINGS) picked.add(r);
  return [...picked].sort((a, b) => a.cost - b.cost).slice(0, MAX_READINGS);
}

/** Candidate readings for one token, most natural first */
export function readingsFor(input: string, reader: Reader | null): Reading[] {
  const text = normalizeWord(input);

  // Kana typed directly is read as is; kanji cannot be read
  if (/[぀-ヿ]/.test(text) && !/[a-z]/i.test(text)) {
    const kana = toKatakana(text);
    return /^[゠-ヿ]+$/.test(kana) ? [{ kana, cost: 0, source: 'kana' }] : [];
  }

  const out = new Readings();
  const sym = SYMBOLS[text];
  if (sym && text !== '.') {
    sym.forEach((k, i) => out.add(k, i * 0.5, 'dict'));
    return pick(out.items);
  }

  const num = readNumber(text);
  if (num) {
    for (const r of num) out.add(r.kana, r.cost, 'number');
    return pick(out.items);
  }

  if (isLetters(text)) wordReadings(text, reader, out);
  // Mixed tokens, and camelCase words that are not in the dictionary
  if (!isLetters(text) || (!DICT[text.toLowerCase()] && /[a-z][A-Z]/.test(text))) compoundReadings(text, reader, out);

  for (const r of [...out.items]) {
    if (r.source === 'number') continue;
    for (const v of variants(r.kana)) out.add(v, r.cost + VARIANT_COST, 'variant');
  }
  return pick(out.items);
}
