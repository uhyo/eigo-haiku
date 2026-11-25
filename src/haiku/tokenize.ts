export interface Token {
  text: string;
  /** Line given by the user, or null when lines are found automatically */
  line: number | null;
}

export interface Tokenized {
  tokens: Token[];
  /** True when the input has exactly three lines, which are then kept as the 5-7-5 split */
  manual: boolean;
}

export function tokenize(input: string): Tokenized {
  const lines = input
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const manual = lines.length === 3;
  const tokens: Token[] = [];
  lines.forEach((l, li) => {
    for (const raw of l.split(/[\s\-/–—_]+/)) {
      const text = raw
        .replace(/[’‘]/g, "'")
        .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');
      if (text) tokens.push({ text, line: manual ? li : null });
    }
  });
  return { tokens, manual };
}
