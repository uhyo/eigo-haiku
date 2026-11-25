export const TARGET = [5, 7, 5] as const;

export interface Option {
  mora: number;
  cost: number;
}

export interface Word {
  /** Line given by the user, or null when lines are found automatically */
  line: number | null;
  options: Option[];
}

export interface Layout {
  ok: boolean;
  /** Chosen option index for each word */
  choice: number[];
  /** Line (0, 1 or 2) for each word */
  split: number[];
  cost: number;
}

interface State {
  cost: number;
  prev: string | null;
  option: number;
  line: number;
}

/**
 * Finds the cheapest choice of readings that splits the words into 5-7-5.
 * When `manual` is true, the user's line breaks must match the split.
 * Returns null when no such choice exists.
 */
export function solve575(words: Word[], manual: boolean): Layout | null {
  const n = words.length;
  if (n === 0) return null;
  const key = (i: number, line: number, acc: number) => `${i}|${line}|${acc}`;
  const best = new Map<string, State>();
  best.set(key(0, 0, 0), { cost: 0, prev: null, option: -1, line: -1 });

  for (let i = 0; i < n; i++) {
    const w = words[i]!;
    const lastOfLine = manual && (i === n - 1 || words[i + 1]!.line !== w.line);
    for (let line = 0; line < 3; line++) {
      if (manual && w.line !== line) continue;
      const target = TARGET[line]!;
      for (let acc = 0; acc < target; acc++) {
        const cur = best.get(key(i, line, acc));
        if (!cur) continue;
        w.options.forEach((o, oi) => {
          const next = acc + o.mora;
          if (next > target) return;
          let nk: string;
          if (next === target) {
            if (manual && !lastOfLine) return;
            nk = key(i + 1, line + 1, 0);
          } else {
            if (manual && lastOfLine) return;
            nk = key(i + 1, line, next);
          }
          const cost = cur.cost + o.cost;
          const ex = best.get(nk);
          if (!ex || cost < ex.cost) best.set(nk, { cost, prev: key(i, line, acc), option: oi, line });
        });
      }
    }
  }

  const end = best.get(key(n, 3, 0));
  if (!end) return null;
  const choice: number[] = new Array(n);
  const split: number[] = new Array(n);
  let node: State = end;
  for (let i = n - 1; i >= 0; i--) {
    choice[i] = node.option;
    split[i] = node.line;
    node = best.get(node.prev!)!;
  }
  return { ok: true, choice, split, cost: end.cost };
}

/** Best-guess layout for display when 5-7-5 is impossible: most natural readings, greedy line fill */
export function fallbackLayout(words: Word[], manual: boolean): Layout {
  const choice = words.map(() => 0);
  const split: number[] = [];
  if (manual) {
    for (const w of words) split.push(w.line ?? 0);
  } else {
    let line = 0;
    let acc = 0;
    for (const w of words) {
      const m = w.options[0]?.mora ?? 0;
      if (line < 2 && acc > 0 && acc + m > TARGET[line]!) {
        line++;
        acc = 0;
      }
      split.push(line);
      acc += m;
      if (line < 2 && acc >= TARGET[line]!) {
        line++;
        acc = 0;
      }
    }
  }
  return { ok: false, choice, split, cost: Infinity };
}
