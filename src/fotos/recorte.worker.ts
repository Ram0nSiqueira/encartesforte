/// <reference lib="webworker" />
// Remoção de fundo no próprio navegador (sem servidor), em segundo plano para não travar a tela.
// Modelo: IS-Net "isnet-general-use" (o mesmo do rembg), em 16 bits (~91 MB, mesmo resultado do
// original de 178 MB), dividido em 2 partes (< 50 MB cada) para caber em qualquer hospedagem.
// O tratamento da máscara é o mesmo do antigo servico-fotos/app.py (recortar_produto):
//   produto 100% sólido, buracos preenchidos, pontinhos soltos descartados, só o contorno suavizado.
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

// O .mjs separado é necessário para o modo com vários núcleos (cada núcleo abre um worker com ele).
ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

const MODELO_PARTES = ['/modelos/isnet-fp16.part1', '/modelos/isnet-fp16.part2'];
const MODELO_TOTAL = 90_648_790; // bytes (para a barra de progresso)
const CACHE = 'encartesforte-modelos-v2';
const CHAVE_CACHE = '/modelos/isnet-fp16.onnx';
const LADO_MODELO = 1024;
const TAMANHO_MAX = 1000; // maior lado das imagens salvas

export type PedidoRecorte = { id: number; tipo: 'recortar'; imagem: Blob } | { id: number; tipo: 'preparar' };
export type RespostaRecorte =
  | { id: number; tipo: 'progresso'; baixado: number; total: number }
  | { id: number; tipo: 'pronto' }
  | { id: number; tipo: 'resultado'; semFundo: Blob; original: Blob; branco: Blob; recortou: boolean; aviso?: string; ms: number }
  | { id: number; tipo: 'erro'; mensagem: string };

const enviar = (r: RespostaRecorte) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(r);

// ---------------------------------------------------------------------------
// Modelo (baixado uma vez e guardado no navegador)
// ---------------------------------------------------------------------------
let sessao: Promise<ort.InferenceSession> | null = null;

async function baixarModelo(id: number): Promise<Uint8Array> {
  const cache = 'caches' in self ? await caches.open(CACHE).catch(() => null) : null;
  const guardado = await cache?.match(CHAVE_CACHE);
  if (guardado) return new Uint8Array(await guardado.arrayBuffer());
  // Apaga versões antigas do modelo guardadas no navegador.
  if ('caches' in self) for (const k of await caches.keys()) if (k.startsWith('encartesforte-modelos-') && k !== CACHE) await caches.delete(k);

  const pedacos: Uint8Array[] = [];
  let baixado = 0;
  let ultimo = 0;
  for (const url of MODELO_PARTES) {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`Não foi possível baixar o modelo de recorte (${res.status}).`);
    const leitor = res.body.getReader();
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      pedacos.push(value);
      baixado += value.length;
      if (baixado - ultimo > 1_000_000) { ultimo = baixado; enviar({ id, tipo: 'progresso', baixado, total: MODELO_TOTAL }); }
    }
  }
  const bytes = new Uint8Array(baixado);
  let pos = 0;
  for (const p of pedacos) { bytes.set(p, pos); pos += p.length; }
  await cache?.put(CHAVE_CACHE, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } })).catch(() => null);
  return bytes;
}

function carregarSessao(id: number) {
  if (!sessao) {
    sessao = baixarModelo(id).then((bytes) => ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] }));
    sessao.catch(() => { sessao = null; });
  }
  return sessao;
}

// ---------------------------------------------------------------------------
// Utilidades de imagem
// ---------------------------------------------------------------------------
function canvas(w: number, h: number) {
  const c = new OffscreenCanvas(w, h);
  return { c, ctx: c.getContext('2d', { willReadFrequently: true })! };
}

/** Distância euclidiana ao quadrado até o pixel "alvo" mais próximo (Felzenszwalb & Huttenlocher). */
function distancia2(alvo: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e20;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = alvo[i] ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float32Array(n), z = new Float32Array(n + 1), out = new Float32Array(n);
  const v = new Int32Array(n);
  const passo = (len: number) => {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      out[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = d[y * w + x];
    passo(h);
    for (let y = 0; y < h; y++) d[y * w + x] = out[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = d[y * w + x];
    passo(w);
    for (let x = 0; x < w; x++) d[y * w + x] = out[x];
  }
  return d;
}

/** Fechamento (dilata e erode) com um disco de raio r. */
function fechar(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const r2 = r * r;
  const dil = distancia2(m, w, h);
  const dilatada = new Uint8Array(w * h);
  for (let i = 0; i < dil.length; i++) dilatada[i] = dil[i] <= r2 ? 1 : 0;
  const fora = new Uint8Array(w * h);
  for (let i = 0; i < fora.length; i++) fora[i] = dilatada[i] ? 0 : 1;
  const ero = distancia2(fora, w, h);
  const res = new Uint8Array(w * h);
  for (let i = 0; i < res.length; i++) res[i] = ero[i] > r2 ? 1 : 0;
  return res;
}

/** Preenche buracos: o que não é alcançável a partir da borda pelo fundo vira produto. */
function preencherBuracos(m: Uint8Array, w: number, h: number) {
  const visto = new Uint8Array(w * h);
  const fila = new Int32Array(w * h);
  let ini = 0, fim = 0;
  const pôr = (i: number) => { if (!m[i] && !visto[i]) { visto[i] = 1; fila[fim++] = i; } };
  for (let x = 0; x < w; x++) { pôr(x); pôr((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { pôr(y * w); pôr(y * w + w - 1); }
  while (ini < fim) {
    const i = fila[ini++], x = i % w;
    if (x > 0) pôr(i - 1);
    if (x < w - 1) pôr(i + 1);
    if (i >= w) pôr(i - w);
    if (i < w * (h - 1)) pôr(i + w);
  }
  for (let i = 0; i < m.length; i++) if (!m[i] && !visto[i]) m[i] = 1;
}

/** Mantém o produto principal e partes grandes (≥ 5% da maior), descarta pontinhos soltos. */
function manterGrandes(m: Uint8Array, w: number, h: number) {
  const rot = new Int32Array(w * h);
  const areas: number[] = [0];
  const fila = new Int32Array(w * h);
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || rot[s]) continue;
    const r = areas.length;
    let ini = 0, fim = 0, area = 0;
    rot[s] = r; fila[fim++] = s;
    while (ini < fim) {
      const i = fila[ini++], x = i % w;
      area++;
      const viz = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1];
      for (const j of viz) if (j >= 0 && m[j] && !rot[j]) { rot[j] = r; fila[fim++] = j; }
    }
    areas.push(area);
  }
  if (areas.length <= 2) return;
  const maior = Math.max(...areas);
  for (let i = 0; i < m.length; i++) if (m[i] && areas[rot[i]] < maior * 0.05) m[i] = 0;
}

/** Erosão simples (vizinhança em cruz), `n` vezes. */
function erodir(m: Uint8Array, w: number, h: number, n: number) {
  let a = m;
  for (let k = 0; k < n; k++) {
    const b = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      b[i] = a[i] && a[i - 1] && a[i + 1] && a[i - w] && a[i + w] ? 1 : 0;
    }
    a = b;
  }
  return a;
}

/** Desfoque gaussiano (sigma 1) da máscara: borda suave. */
function suavizar(m: Uint8Array, w: number, h: number): Float32Array {
  const k = [0.0044, 0.054, 0.242, 0.399, 0.242, 0.054, 0.0044];
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let j = -3; j <= 3; j++) { const xx = Math.min(w - 1, Math.max(0, x + j)); s += m[y * w + xx] * k[j + 3]; }
    tmp[y * w + x] = s;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let j = -3; j <= 3; j++) { const yy = Math.min(h - 1, Math.max(0, y + j)); s += tmp[yy * w + x] * k[j + 3]; }
    out[y * w + x] = s;
  }
  return out;
}

/**
 * Redimensiona RGB com filtro Lanczos (igual ao Pillow/rembg). O filtro faz diferença no resultado
 * do modelo: com o bilinear do canvas, algumas fotos pequenas saem com o produto cortado.
 */
function lanczosRGB(px: Uint8ClampedArray, w: number, h: number, W: number, H: number): Float32Array {
  const a = 3;
  const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
  const L = (x: number) => (Math.abs(x) < a ? sinc(x) * sinc(x / a) : 0);
  const pesos = (dentro: number, fora: number) => {
    const esc = dentro / fora, f = Math.max(esc, 1), sup = a * f;
    return Array.from({ length: fora }, (_, o) => {
      const c = (o + 0.5) * esc;
      const i0 = Math.max(0, Math.floor(c - sup)), i1 = Math.min(dentro, Math.ceil(c + sup));
      const ws: number[] = [];
      let soma = 0;
      for (let i = i0; i < i1; i++) { const v = L((i + 0.5 - c) / f); ws.push(v); soma += v; }
      return { i0, ws: ws.map((v) => v / (soma || 1)) };
    });
  };
  const px1 = pesos(w, W), py1 = pesos(h, H);
  const tmp = new Float32Array(W * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
    const { i0, ws } = px1[x];
    let r = 0, g = 0, b = 0;
    for (let k = 0; k < ws.length; k++) { const j = (y * w + i0 + k) * 4; r += px[j] * ws[k]; g += px[j + 1] * ws[k]; b += px[j + 2] * ws[k]; }
    const t = (y * W + x) * 3; tmp[t] = r; tmp[t + 1] = g; tmp[t + 2] = b;
  }
  const out = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    const { i0, ws } = py1[y];
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < ws.length; k++) { const t = ((i0 + k) * W + x) * 3; r += tmp[t] * ws[k]; g += tmp[t + 1] * ws[k]; b += tmp[t + 2] * ws[k]; }
      const o = (y * W + x) * 3;
      out[o] = Math.min(255, Math.max(0, Math.round(r)));
      out[o + 1] = Math.min(255, Math.max(0, Math.round(g)));
      out[o + 2] = Math.min(255, Math.max(0, Math.round(b)));
    }
  }
  return out;
}

async function png(c: OffscreenCanvas) {
  return c.convertToBlob({ type: 'image/png' });
}

/** Recorta as bordas totalmente transparentes. */
function aparar(c: OffscreenCanvas, alfa: Float32Array) {
  const w = c.width, h = c.height;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (alfa[y * w + x] > 0.004) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return c;
  const { c: r, ctx } = canvas(x1 - x0 + 1, y1 - y0 + 1);
  ctx.drawImage(c, -x0, -y0);
  return r;
}

/** Produto sobre um quadrado branco, centralizado, com 8% de margem. */
function fundoBranco(produto: OffscreenCanvas) {
  const lado0 = Math.max(produto.width, produto.height);
  const margem = Math.round(lado0 * 0.08);
  const lado = lado0 + margem * 2;
  const { c, ctx } = canvas(lado, lado);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, lado, lado);
  ctx.drawImage(produto, Math.floor((lado - produto.width) / 2), Math.floor((lado - produto.height) / 2));
  return c;
}

// ---------------------------------------------------------------------------
// Recorte
// ---------------------------------------------------------------------------
async function recortar(id: number, arquivo: Blob) {
  const t0 = performance.now();
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('O arquivo enviado não é uma imagem válida (use PNG, JPG ou WEBP).');
  }
  const esc = Math.min(1, TAMANHO_MAX / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * esc)), h = Math.max(1, Math.round(bmp.height * esc));

  // Foto original (limitada a 1000 px).
  const { c: orig, ctx: octx } = canvas(w, h);
  octx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const original = await png(orig);

  let recortou = false;
  let aviso: string | undefined;
  let resultado: OffscreenCanvas = orig;
  try {
    const s = await carregarSessao(id);

    // Entrada do modelo: 1024×1024, fundo transparente vira branco, normalizada como no rembg.
    const { ctx: bctx } = canvas(w, h);
    bctx.fillStyle = '#fff';
    bctx.fillRect(0, 0, w, h);
    bctx.drawImage(orig, 0, 0);
    const px = lanczosRGB(bctx.getImageData(0, 0, w, h).data, w, h, LADO_MODELO, LADO_MODELO);
    const n = LADO_MODELO * LADO_MODELO;
    let max = 1e-6;
    for (let i = 0; i < px.length; i++) if (px[i] > max) max = px[i];
    const dados = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      dados[i] = px[i * 3] / max - 0.5;
      dados[n + i] = px[i * 3 + 1] / max - 0.5;
      dados[2 * n + i] = px[i * 3 + 2] / max - 0.5;
    }
    const saida = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', dados, [1, 3, LADO_MODELO, LADO_MODELO]) });
    const pred = saida[s.outputNames[0]].data as Float32Array;
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < n; i++) { if (pred[i] < mn) mn = pred[i]; if (pred[i] > mx) mx = pred[i]; }

    // Máscara no tamanho da foto.
    const { c: mc, ctx: mctx } = canvas(LADO_MODELO, LADO_MODELO);
    const mimg = mctx.createImageData(LADO_MODELO, LADO_MODELO);
    for (let i = 0; i < n; i++) {
      const v = Math.round(((pred[i] - mn) / (mx - mn + 1e-9)) * 255);
      mimg.data[i * 4] = mimg.data[i * 4 + 1] = mimg.data[i * 4 + 2] = v;
      mimg.data[i * 4 + 3] = 255;
    }
    mctx.putImageData(mimg, 0, 0);
    const { ctx: m2 } = canvas(w, h);
    m2.imageSmoothingQuality = 'high';
    m2.drawImage(mc, 0, 0, w, h);
    const mpx = m2.getImageData(0, 0, w, h).data;

    // Máscara sólida (com margem, para não "colar" o produto na borda da foto).
    const raio = Math.max(2, Math.floor(Math.max(w, h) * 0.03));
    const mg = raio + 2;
    const W = w + mg * 2, H = h + mg * 2;
    const bruto = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bruto[(y + mg) * W + x + mg] = mpx[(y * w + x) * 4] > 25.5 ? 1 : 0;
    const solido = fechar(bruto, W, H, raio);
    const m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = solido[(y + mg) * W + x + mg];
    preencherBuracos(m, w, h);
    manterGrandes(m, w, h);

    let cobertura = 0;
    for (let i = 0; i < m.length; i++) cobertura += m[i];
    cobertura /= m.length;
    if (cobertura < 0.03) {
      aviso = 'Não foi possível separar o produto do fundo nesta foto; ela foi salva com o fundo original.';
    } else {
      const alfa = suavizar(m, w, h);
      const dentro = erodir(m, w, h, 2);
      const img = octx.getImageData(0, 0, w, h);
      for (let i = 0; i < m.length; i++) {
        const a = dentro[i] ? 1 : Math.min(1, Math.max(0, alfa[i]));
        alfa[i] = a;
        img.data[i * 4 + 3] = Math.round(img.data[i * 4 + 3] * a);
      }
      const { c: rc, ctx: rctx } = canvas(w, h);
      rctx.putImageData(img, 0, 0);
      resultado = aparar(rc, alfa);
      recortou = true;
    }
  } catch (e) {
    console.error('[recorte]', e);
    aviso = 'Não foi possível remover o fundo; a foto foi salva com o fundo original.';
  }

  const semFundo = await png(resultado);
  const branco = await png(recortou ? fundoBranco(resultado) : orig);
  enviar({ id, tipo: 'resultado', semFundo, original, branco, recortou, aviso, ms: Math.round(performance.now() - t0) });
}

self.onmessage = async (ev: MessageEvent<PedidoRecorte>) => {
  const p = ev.data;
  try {
    if (p.tipo === 'preparar') {
      await carregarSessao(p.id);
      enviar({ id: p.id, tipo: 'pronto' });
    } else {
      await recortar(p.id, p.imagem);
    }
  } catch (e) {
    enviar({ id: p.id, tipo: 'erro', mensagem: e instanceof Error ? e.message : String(e) });
  }
};
