import type { Candidate } from '../e2k/model.ts';
import { DICT, NUMBERS, SPELL } from './dictionary.ts';
import { toKatakana } from './mora.ts';

export type ReadingSource = 'kana' | 'dict' | 'spell' | 'model' | 'variant' | 'lock';

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
const VARIANT_COST = 1.5;
const MAX_READINGS = 8;

/** Common spelling variants that change the mora count */
export function variants(kana: string): string[] {
  const out: string[] = [];
  // サーバー → サーバ
  if (kana.length > 2 && kana.endsWith('ー')) out.push(kana.slice(0, -1));
  // ハロウィーン → ハロウィン
  const shortened = kana.replace(/ィー/g, 'ィ');
  if (shortened !== kana) out.push(shortened);
  // ウィ (1 mora) ⇔ ウイ (2 morae)
  if (kana.includes('ウィ')) out.push(kana.replace(/ウィ/g, 'ウイ'));
  if (kana.includes('ウイ')) out.push(kana.replace(/ウイ/g, 'ウィ'));
  return out;
}

const isAcronym = (text: string) =>
  text.length >= 2 && text.length <= 5 && text === text.toUpperCase() && /[A-Z]/.test(text);

/** Candidate readings for one token, most natural first */
export function readingsFor(text: string, reader: Reader | null): Reading[] {
  const lower = text.toLowerCase();
  const list: Reading[] = [];
  const add = (kana: string, cost: number, source: ReadingSource) => {
    if (kana && !list.some((x) => x.kana === kana)) list.push({ kana, cost, source });
  };

  // Kana typed directly is read as is
  if (/[぀-ヿ]/.test(text) && !/[a-z]/i.test(text)) {
    add(toKatakana(text), 0, 'kana');
    return list;
  }

  if (/^\d+$/.test(text)) {
    const known = NUMBERS[Number(text)];
    if (known) known.forEach((k, i) => add(k, i * 0.7, 'dict'));
    else add([...text].map((d) => NUMBERS[Number(d)]![0]).join(''), 0, 'dict');
    return list;
  }

  if (!/^[a-z']+$/i.test(text)) return list;

  const acronym = isAcronym(text);
  const spelled = [...lower].map((c) => SPELL[c] ?? '').join('');
  if (acronym) add(spelled, 0, 'spell');
  DICT[lower]?.forEach((k, i) => add(k, (acronym ? 1 : 0) + i * 0.7, 'dict'));

  if (reader) {
    const cands = reader.candidates(lower);
    const best = cands[0]?.kana ?? '';
    const base = list.length ? 1.2 : 0;
    const minProb = base ? MIN_PROB_WITH_DICT : MIN_PROB;
    cands.forEach((c, i) => {
      const p = Math.exp(c.logp);
      if ((i > 0 || base) && p < minProb) return;
      // Truncated beams (a prefix of the best reading) are usually junk
      if (i > 0 && best.startsWith(c.kana) && best !== c.kana + 'ー') return;
      add(c.kana, base + Math.max(0, -Math.log(p)), 'model');
    });
  }

  for (const r of [...list]) for (const v of variants(r.kana)) add(v, r.cost + VARIANT_COST, 'variant');
  return list.slice(0, MAX_READINGS);
}
