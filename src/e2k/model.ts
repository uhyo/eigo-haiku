// English → Katakana inference.
// A TypeScript port of the C2K model from Patchethium/e2k (https://github.com/Patchethium/e2k).
// Beam search returns several candidate readings with their log probabilities.

export interface Candidate {
  kana: string;
  logp: number;
}

interface Tensor {
  data: Float32Array;
  shape: number[];
}

type Tensors = Record<string, Tensor>;

interface SafetensorsHeaderEntry {
  dtype: string;
  shape: number[];
  data_offsets: [number, number];
}

function halfToFloat(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

export function loadSafetensors(buf: ArrayBuffer): { tensors: Tensors; meta: Record<string, string> } {
  const dv = new DataView(buf);
  const headerLen = Number(dv.getBigUint64(0, true));
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, headerLen))) as Record<
    string,
    SafetensorsHeaderEntry | Record<string, string>
  >;
  const meta = (header.__metadata__ ?? {}) as Record<string, string>;
  delete header.__metadata__;
  const base = 8 + headerLen;
  const tensors: Tensors = {};
  for (const [name, raw] of Object.entries(header)) {
    const info = raw as SafetensorsHeaderEntry;
    const [start, end] = info.data_offsets;
    const n = info.shape.reduce((a, b) => a * b, 1);
    const out = new Float32Array(n);
    if (info.dtype === 'F16') {
      const u16 = new Uint16Array(buf.slice(base + start, base + end));
      for (let i = 0; i < n; i++) out[i] = halfToFloat(u16[i]!);
    } else if (info.dtype === 'F32') {
      out.set(new Float32Array(buf.slice(base + start, base + end)));
    } else {
      throw new Error(`unsupported dtype ${info.dtype}`);
    }
    tensors[name] = { data: out, shape: info.shape };
  }
  return { tensors, meta };
}

/** y = W x + b, where W has shape [out, in] */
function linear(W: Tensor, b: Tensor | null, x: ArrayLike<number>): Float32Array {
  const [out, inn] = W.shape as [number, number];
  const w = W.data;
  const y = new Float32Array(out);
  for (let o = 0; o < out; o++) {
    let s = b ? b.data[o]! : 0;
    const off = o * inn;
    for (let i = 0; i < inn; i++) s += w[off + i]! * x[i]!;
    y[o] = s;
  }
  return y;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function need(t: Tensors, name: string): Tensor {
  const v = t[name];
  if (!v) throw new Error(`missing tensor ${name}`);
  return v;
}

/** PyTorch-compatible GRU cell (gate order r, z, n) */
class GRUCell {
  private wih: Tensor;
  private whh: Tensor;
  private bih: Tensor;
  private bhh: Tensor;
  private H: number;

  constructor(t: Tensors, prefix: string, suffix = '') {
    this.wih = need(t, `${prefix}.weight_ih_l0${suffix}`);
    this.whh = need(t, `${prefix}.weight_hh_l0${suffix}`);
    this.bih = need(t, `${prefix}.bias_ih_l0${suffix}`);
    this.bhh = need(t, `${prefix}.bias_hh_l0${suffix}`);
    this.H = this.whh.shape[1]!;
  }

  step(x: ArrayLike<number>, hPrev: Float32Array | null): Float32Array {
    const H = this.H;
    const h = hPrev ?? new Float32Array(H);
    const gi = linear(this.wih, this.bih, x);
    const gh = linear(this.whh, this.bhh, h);
    const out = new Float32Array(H);
    for (let j = 0; j < H; j++) {
      const r = sigmoid(gi[j]! + gh[j]!);
      const z = sigmoid(gi[H + j]! + gh[H + j]!);
      const n = Math.tanh(gi[2 * H + j]! + r * gh[2 * H + j]!);
      out[j] = (1 - z) * n + z * h[j]!;
    }
    return out;
  }
}

function sliceRows(T: Tensor, from: number, to: number): Tensor {
  const inn = T.shape[1]!;
  return { data: T.data.subarray(from * inn, to * inn), shape: [to - from, inn] };
}

function sliceVec(T: Tensor, from: number, to: number): Tensor {
  return { data: T.data.subarray(from, to), shape: [to - from] };
}

interface Memory {
  K: Float32Array[];
  V: Float32Array[];
}

interface Beam {
  toks: number[];
  h1: Float32Array | null;
  h2: Float32Array | null;
  lp: number;
}

export interface CandidateOptions {
  beam?: number;
  maxLen?: number;
}

export class E2K {
  readonly cache = new Map<string, Candidate[]>();
  private t: Tensors;
  private sos: number;
  private eos: number;
  private inTable: Map<string, number>;
  private outTable: string[];
  private enc: GRUCell;
  private encRev: GRUCell;
  private pre: GRUCell;
  private post: GRUCell;
  private D: number;
  private heads = 4;
  private qW: Tensor;
  private qB: Tensor;
  private kW: Tensor;
  private kB: Tensor;
  private vW: Tensor;
  private vB: Tensor;

  constructor(buf: ArrayBuffer) {
    const { tensors: t, meta } = loadSafetensors(buf);
    this.t = t;
    this.sos = Number(meta.sos_idx);
    this.eos = Number(meta.eos_idx);
    this.inTable = new Map((meta.in_table ?? '').split('\0').map((c, i) => [c, i] as const));
    this.outTable = (meta.out_table ?? '').split('\0');
    this.enc = new GRUCell(t, 'encoder');
    this.encRev = new GRUCell(t, 'encoder', '_reverse');
    this.pre = new GRUCell(t, 'pre_decoder');
    this.post = new GRUCell(t, 'post_decoder');
    const D = need(t, 'attn.out_proj.weight').shape[0]!;
    this.D = D;
    const ipw = need(t, 'attn.in_proj_weight');
    const ipb = need(t, 'attn.in_proj_bias');
    this.qW = sliceRows(ipw, 0, D);
    this.qB = sliceVec(ipb, 0, D);
    this.kW = sliceRows(ipw, D, 2 * D);
    this.kB = sliceVec(ipb, D, 2 * D);
    this.vW = sliceRows(ipw, 2 * D, 3 * D);
    this.vB = sliceVec(ipb, 2 * D, 3 * D);
  }

  private emb(name: string, idx: number): Float32Array {
    const E = need(this.t, name);
    const d = E.shape[1]!;
    return E.data.subarray(idx * d, (idx + 1) * d);
  }

  private encode(word: string): Memory {
    const src = [this.sos];
    for (const c of word.toLowerCase()) {
      const i = this.inTable.get(c);
      if (i !== undefined) src.push(i);
    }
    src.push(this.eos);
    const xs = src.map((i) => this.emb('e_emb.weight', i));
    const T = xs.length;
    const fw: Float32Array[] = [];
    const bw: Float32Array[] = new Array(T);
    let h: Float32Array | null = null;
    for (let i = 0; i < T; i++) {
      h = this.enc.step(xs[i]!, h);
      fw.push(h);
    }
    h = null;
    for (let i = T - 1; i >= 0; i--) {
      h = this.encRev.step(xs[i]!, h);
      bw[i] = h;
    }
    const fcW = need(this.t, 'encoder_fc.0.weight');
    const fcB = need(this.t, 'encoder_fc.0.bias');
    const enc = fw.map((f, i) => {
      const cat = new Float32Array(f.length * 2);
      cat.set(f);
      cat.set(bw[i]!, f.length);
      return linear(fcW, fcB, cat).map(Math.tanh);
    });
    return {
      K: enc.map((e) => linear(this.kW, this.kB, e)),
      V: enc.map((e) => linear(this.vW, this.vB, e)),
    };
  }

  private attend(q: Float32Array, { K, V }: Memory): Float32Array {
    const D = this.D;
    const dh = D / this.heads;
    const T = K.length;
    const qq = linear(this.qW, this.qB, q);
    const o = new Float32Array(D);
    const scale = Math.sqrt(dh);
    for (let hd = 0; hd < this.heads; hd++) {
      const off = hd * dh;
      const sc = new Float64Array(T);
      let mx = -Infinity;
      for (let t = 0; t < T; t++) {
        let s = 0;
        for (let j = 0; j < dh; j++) s += qq[off + j]! * K[t]![off + j]!;
        sc[t] = s / scale;
        if (sc[t]! > mx) mx = sc[t]!;
      }
      let sum = 0;
      for (let t = 0; t < T; t++) {
        sc[t] = Math.exp(sc[t]! - mx);
        sum += sc[t]!;
      }
      for (let t = 0; t < T; t++) {
        const a = sc[t]! / sum;
        for (let j = 0; j < dh; j++) o[off + j]! += a * V[t]![off + j]!;
      }
    }
    return linear(need(this.t, 'attn.out_proj.weight'), need(this.t, 'attn.out_proj.bias'), o);
  }

  private step(token: number, h1: Float32Array | null, h2: Float32Array | null, mem: Memory) {
    const n1 = this.pre.step(this.emb('k_emb.weight', token), h1);
    const a = this.attend(n1, mem);
    const cat = new Float32Array(n1.length + a.length);
    cat.set(n1);
    cat.set(a, n1.length);
    const n2 = this.post.step(cat, h2);
    const logits = linear(need(this.t, 'fc.weight'), need(this.t, 'fc.bias'), n2);
    let mx = -Infinity;
    for (const v of logits) if (v > mx) mx = v;
    let sum = 0;
    for (const v of logits) sum += Math.exp(v - mx);
    const lse = mx + Math.log(sum);
    return { h1: n1, h2: n2, lp: logits.map((v) => v - lse) };
  }

  /** Candidate readings, most probable first */
  candidates(word: string, { beam = 5, maxLen = 24 }: CandidateOptions = {}): Candidate[] {
    const key = word.toLowerCase();
    const hit = this.cache.get(key);
    if (hit) return hit;
    const mem = this.encode(key);
    let beams: Beam[] = [{ toks: [this.sos], h1: null, h2: null, lp: 0 }];
    const done: Beam[] = [];
    for (let s = 0; s < maxLen && beams.length; s++) {
      const expanded: Beam[] = [];
      for (const b of beams) {
        const r = this.step(b.toks[b.toks.length - 1]!, b.h1, b.h2, mem);
        const top = Array.from(r.lp.keys())
          .sort((x, y) => r.lp[y]! - r.lp[x]!)
          .slice(0, beam);
        for (const i of top) expanded.push({ toks: [...b.toks, i], h1: r.h1, h2: r.h2, lp: b.lp + r.lp[i]! });
      }
      expanded.sort((x, y) => y.lp - x.lp);
      beams = [];
      for (const e of expanded) {
        if (e.toks[e.toks.length - 1] === this.eos) done.push(e);
        else if (beams.length < beam) beams.push(e);
        if (done.length >= beam * 2) break;
      }
    }
    const seen = new Set<string>();
    const out: Candidate[] = [];
    for (const d of done.sort((a, b) => b.lp - a.lp)) {
      const kana = d.toks
        .slice(1, -1)
        .map((i) => this.outTable[i])
        .join('');
      if (!kana || seen.has(kana)) continue;
      seen.add(kana);
      out.push({ kana, logp: d.lp });
    }
    this.cache.set(key, out);
    return out;
  }
}
