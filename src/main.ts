import './style.css';
import { E2K } from './e2k/model.ts';
import { moraCount, morae, toKatakana } from './haiku/mora.ts';
import { readingsFor, type Reading } from './haiku/readings.ts';
import { fallbackLayout, solve575, TARGET, type Layout } from './haiku/solver.ts';
import { tokenize, type Token } from './haiku/tokenize.ts';

const PRESETS = [
  'level 2 ice cream island',
  'Christmas\nSanta Claus\npresent',
  'Friday server down sunrise',
  'spring Starbucks street',
  'Halloween ghost party pumpkin',
];
const MODEL_URL = `${import.meta.env.BASE_URL}model-c2k.safetensors`;
const STORAGE_KEY = 'jeh-src';

interface ScoredReading extends Reading {
  mora: number;
}
interface WordState extends Token {
  options: ScoredReading[];
  locked: boolean;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const src = $<HTMLTextAreaElement>('src');
const grid = $('grid');
const card = $('card');
const statusEl = $('status');
const kanaEl = $('kana');
const stamp = $('stamp');

let model: E2K | null = null;
let words: WordState[] = [];
let result: Layout | null = null;
let manual = false;
let selected = -1;
let runId = 0;
let lastOk: boolean | null = null;
/** "index|text" → reading chosen by the user */
const locks = new Map<string, string>();
const lockKey = (i: number, text: string) => `${i}|${text}`;
const withMora = (r: Reading): ScoredReading => ({ ...r, mora: moraCount(r.kana) });

$('presets').innerHTML = PRESETS.map(
  (p, i) => `<button class="chip" type="button" data-i="${i}">${esc(p.replace(/\n/g, ' / '))}</button>`,
).join('');
$('presets').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
  if (!b) return;
  src.value = PRESETS[Number(b.dataset.i)]!;
  locks.clear();
  selected = -1;
  void run();
});

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) src.value = saved;
} catch {
  // storage may be unavailable
}

function cellsIn(line: number): number {
  if (!result) return 0;
  let n = 0;
  words.forEach((w, i) => {
    if (result!.split[i] === line) n += w.options[result!.choice[i]!]?.mora ?? 0;
  });
  return Math.max(n, TARGET[line]!);
}

function sizeCells() {
  const maxCells = Math.max(7, cellsIn(0), cellsIn(1), cellsIn(2));
  const avail = card.clientWidth - 2 * parseFloat(getComputedStyle(card).paddingLeft) - 56;
  card.style.setProperty('--sq', `${Math.max(22, Math.min(46, Math.floor(avail / maxCells)))}px`);
}
const cardObserver = new ResizeObserver(sizeCells);
cardObserver.observe(card);

async function run() {
  const id = ++runId;
  try {
    localStorage.setItem(STORAGE_KEY, src.value);
  } catch {
    // storage may be unavailable
  }
  const { tokens, manual: m } = tokenize(src.value);
  manual = m;
  if (!model) return render();
  const next: WordState[] = [];
  for (const [i, t] of tokens.entries()) {
    const lock = locks.get(lockKey(i, t.text));
    let options: Reading[];
    if (lock) {
      options = [{ kana: lock, cost: 0, source: 'lock' }];
    } else {
      // Yield between uncached words so typing stays responsive
      if (!model.cache.has(t.text.toLowerCase())) await new Promise((r) => setTimeout(r, 0));
      if (id !== runId) return;
      options = readingsFor(t.text, model);
    }
    next.push({ ...t, options: options.map(withMora).filter((o) => o.mora > 0), locked: !!lock });
  }
  if (id !== runId) return;
  words = next;
  const unknown = words.filter((w) => !w.options.length);
  result = unknown.length ? null : (solve575(words, manual) ?? fallbackLayout(words, manual));
  render(unknown);
}

function clearResult(message: string) {
  statusEl.textContent = message;
  grid.innerHTML = '';
  kanaEl.textContent = '';
  stamp.className = 'stamp';
  $('picker').hidden = true;
}

function render(unknown: WordState[] = []) {
  if (!model) return void (statusEl.textContent = '読みモデルを読み込み中…（約4MB）');
  if (!words.length) return clearResult('英単語を入力してください。');
  if (unknown.length || !result) {
    return clearResult(
      `読めない単語があります：${unknown.map((w) => w.text).join('、')}（英字・数字・かなで入力してください）`,
    );
  }
  const r = result;
  sizeCells();
  grid.innerHTML = [0, 1, 2]
    .map((line) => {
      const target = TARGET[line]!;
      let used = 0;
      let html = '';
      words.forEach((w, i) => {
        if (r.split[i] !== line) return;
        const o = w.options[r.choice[i]!]!;
        const ms = morae(o.kana);
        const cells = ms
          .map(
            (m, k) =>
              `<span class="c${m.length > 1 ? ' two' : ''}${used + k >= target ? ' over' : ''}">${esc(m)}</span>`,
          )
          .join('');
        used += ms.length;
        const cls = ['word', r.choice[i]! > 0 && 'alt', w.locked && 'locked', selected === i && 'sel']
          .filter(Boolean)
          .join(' ');
        html += `<button type="button" class="${cls}" data-w="${i}" aria-label="${esc(w.text)}：${esc(o.kana)}（${ms.length}拍）"><span class="en">${esc(w.text)}</span><span class="sq">${cells}</span></button>`;
      });
      for (let k = used; k < target; k++) html += '<span class="c empty"></span>';
      const ok = used === target;
      return `<div class="row"><div class="cells">${html}</div><span class="count${ok ? '' : ' bad'}">${used}／${target}</span></div>`;
    })
    .join('');

  kanaEl.textContent = [0, 1, 2]
    .map((line) =>
      words.map((w, i) => (r.split[i] === line ? w.options[r.choice[i]!]!.kana : '')).join(''),
    )
    .join('　');

  const total = words.reduce((s, w, i) => s + w.options[r.choice[i]!]!.mora, 0);
  if (r.ok) {
    statusEl.textContent = r.choice.some((c) => c > 0)
      ? '5・7・5 成立（＊の単語は読みを変えて合わせています）'
      : '5・7・5 成立';
  } else if (manual) {
    statusEl.textContent = '指定の句切れでは5・7・5になりません。単語をタップして読みを変えてみてください。';
  } else {
    const d = total - 17;
    statusEl.textContent =
      d === 0
        ? '合計17拍ですが、単語の切れ目で5・7・5に分けられません。'
        : `合計${total}拍で、17拍より${Math.abs(d)}拍${d > 0 ? '多い（字余り）' : '少ない（字足らず）'}です。`;
  }
  stamp.className = `stamp on${r.ok ? '' : ' ng'}${lastOk !== r.ok ? ' pop' : ''}`;
  stamp.innerHTML = r.ok ? '五七五<br>成立' : '不成立';
  lastOk = r.ok;
  renderPicker();
}

function renderPicker() {
  const picker = $('picker');
  const w = words[selected];
  if (!w || !result || !model) {
    picker.hidden = true;
    return;
  }
  picker.hidden = false;
  $('pickTitle').textContent = `「${w.text}」の読み`;
  const lock = locks.get(lockKey(selected, w.text));
  const all = lock ? readingsFor(w.text, model).map(withMora) : w.options;
  if (lock && !all.some((o) => o.kana === lock)) all.unshift(withMora({ kana: lock, cost: 0, source: 'lock' }));
  const current = w.options[result.choice[selected]!]!.kana;
  $('opts').innerHTML =
    all
      .map(
        (o) =>
          `<button type="button" class="opt${o.kana === current ? ' cur' : ''}" data-k="${esc(o.kana)}">${esc(o.kana)}<small>${o.mora}拍</small></button>`,
      )
      .join('') + (lock ? '<button type="button" class="opt" data-auto="1">自動に戻す</button>' : '');
}

grid.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-w]');
  if (!b) return;
  const i = Number(b.dataset.w);
  selected = selected === i ? -1 : i;
  render();
});

$('opts').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b || selected < 0) return;
  const k = lockKey(selected, words[selected]!.text);
  if (b.dataset.auto) locks.delete(k);
  else locks.set(k, b.dataset.k!);
  void run();
});

$('customForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>('customIn');
  const v = toKatakana(input.value.trim());
  if (selected < 0 || !moraCount(v)) return;
  locks.set(lockKey(selected, words[selected]!.text), v);
  input.value = '';
  void run();
});

$('reset').addEventListener('click', () => {
  locks.clear();
  selected = -1;
  void run();
});

const copyBtn = $<HTMLButtonElement>('copy');
copyBtn.addEventListener('click', async () => {
  const r = result;
  if (!r) return;
  const en = [0, 1, 2]
    .map((line) =>
      words
        .filter((_, i) => r.split[i] === line)
        .map((w) => w.text)
        .join(' '),
    )
    .join(' / ');
  try {
    await navigator.clipboard.writeText(`${en}\n${kanaEl.textContent}\n${statusEl.textContent}`);
    copyBtn.textContent = 'コピーしました';
  } catch {
    copyBtn.textContent = 'コピーできませんでした';
  }
  setTimeout(() => (copyBtn.textContent = '結果をコピー'), 1600);
});

let timer = 0;
src.addEventListener('input', () => {
  clearTimeout(timer);
  selected = -1;
  timer = window.setTimeout(() => void run(), 250);
});

fetch(MODEL_URL)
  .then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.arrayBuffer();
  })
  .then((buf) => {
    model = new E2K(buf);
    statusEl.textContent = '判定中…';
    void run();
  })
  .catch(() => {
    statusEl.textContent = '読みモデルを読み込めませんでした。ページを再読み込みしてください。';
  });
render();
