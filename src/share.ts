/** A reading the user chose for the word at `index` */
export interface ReadingLock {
  index: number;
  kana: string;
}

export interface Permalink {
  text: string | null;
  locks: ReadingLock[];
}

export const HASHTAG = 'ジャパニーズ英語俳句';

/** Query string for a haiku: ?q=<input>&r=<index>:<kana>,... */
export function toQuery(text: string, locks: ReadingLock[]): string {
  if (!text.trim()) return '';
  const params = new URLSearchParams({ q: text.trim() });
  if (locks.length) {
    params.set(
      'r',
      [...locks]
        .sort((a, b) => a.index - b.index)
        .map((l) => `${l.index}:${l.kana}`)
        .join(','),
    );
  }
  return `?${params}`;
}

export function fromQuery(search: string): Permalink {
  const params = new URLSearchParams(search);
  const locks: ReadingLock[] = [];
  for (const part of (params.get('r') ?? '').split(',')) {
    const m = /^(\d+):(.+)$/.exec(part);
    if (m) locks.push({ index: Number(m[1]), kana: m[2]! });
  }
  return { text: params.get('q'), locks };
}

export interface ShareInput {
  /** English words of each line */
  english: string[];
  /** Katakana reading of each line */
  kana: string[];
  ok: boolean;
  url: string;
}

export function shareText({ english, kana, ok }: Omit<ShareInput, 'url'>): string {
  // A haiku that works needs no label; only a failed one is marked
  return `${english.join(' / ')}\n${kana.join('／')}${ok ? '' : '（不成立）'}\n#${HASHTAG}`;
}

export function shareUrl(input: ShareInput): string {
  const params = new URLSearchParams({ text: shareText(input), url: input.url });
  return `https://x.com/intent/tweet?${params}`;
}
