import { describe, expect, test } from 'vitest';
import { fromQuery, shareText, shareUrl, toQuery } from './share.ts';

describe('permalink', () => {
  test('round-trips text with line breaks and locks', () => {
    const q = toQuery('Christmas\nSanta Claus\npresent ', [
      { index: 2, kana: 'クロース' },
      { index: 0, kana: 'クリスマス' },
    ]);
    expect(fromQuery(q)).toEqual({
      text: 'Christmas\nSanta Claus\npresent',
      locks: [
        { index: 0, kana: 'クリスマス' },
        { index: 2, kana: 'クロース' },
      ],
    });
  });

  test('is empty for empty input', () => {
    expect(toQuery('  ', [])).toBe('');
    expect(fromQuery('')).toEqual({ text: null, locks: [] });
  });

  test('ignores malformed locks', () => {
    expect(fromQuery('?q=a&r=x:ア,1:,2:イ').locks).toEqual([{ index: 2, kana: 'イ' }]);
  });
});

describe('share', () => {
  const input = {
    english: ['level 2', 'ice cream', 'island'],
    kana: ['レベルツー', 'アイスクリーム', 'アイランド'],
    ok: true,
    url: 'https://example.com/?q=level+2',
  };

  test('builds the post text', () => {
    expect(shareText(input)).toBe(
      'level 2 / ice cream / island\nレベルツー／アイスクリーム／アイランド（5・7・5 成立）\n#ジャパニーズ英語俳句',
    );
  });

  test('builds an X intent URL', () => {
    const u = new URL(shareUrl(input));
    expect(u.origin + u.pathname).toBe('https://x.com/intent/tweet');
    expect(u.searchParams.get('url')).toBe(input.url);
    expect(u.searchParams.get('text')).toBe(shareText(input));
  });
});
