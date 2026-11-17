/**
 * Prepara a foto de um produto para o encarte:
 * - opcionalmente remove o fundo branco ligado às bordas (fotos de embalagem em fundo branco);
 * - detecta se a imagem é um "recorte" (fundo transparente) ou uma foto comum;
 * - recorta as sobras transparentes para o produto ocupar o espaço disponível.
 */

export interface PreparedPhoto {
  canvas: HTMLCanvasElement;
  /** true quando o fundo é transparente (desenhar solto, com sombra). */
  cutout: boolean;
}

const MAX = 900;
const LOAD_TIMEOUT = 40000;
const cache = new Map<string, Promise<PreparedPhoto>>();
const ready = new Map<string, PreparedPhoto>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('Tempo esgotado ao carregar a imagem')), LOAD_TIMEOUT);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error(`Não foi possível carregar a imagem: ${src.slice(0, 80)}`)); };
    img.src = src;
  });
}

function removeWhiteBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const isBg = (i: number) => {
    const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a < 16) return true;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return min >= 222 && max - min <= 28; // quase branco e sem cor
  };

  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const p = y * w + x;
    if (!visited[p] && isBg(p * 4)) { visited[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w, y = (p / w) | 0;
    d[p * 4 + 3] = 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }

  // Suaviza a borda: pixels claros vizinhos do fundo ficam semitransparentes.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (visited[p]) continue;
      const nearBg = visited[p - 1] || visited[p + 1] || visited[p - w] || visited[p + w];
      if (!nearBg) continue;
      const i = p * 4;
      const light = Math.min(d[i], d[i + 1], d[i + 2]);
      if (light > 190) d[i + 3] = Math.round(255 * (1 - (light - 190) / 65) * 0.9);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function transparentShare(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const d = ctx.getImageData(0, 0, w, h).data;
  let t = 0;
  for (let i = 3; i < d.length; i += 16) if (d[i] < 32) t++;
  return t / (d.length / 16);
}

function cornersTransparent(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const pts = [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]];
  return pts.filter(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3] < 32).length >= 3;
}

function trimTransparent(src: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = src.getContext('2d')!;
  const { width: w, height: h } = src;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return src;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d')!.drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

async function prepare(src: string, removeBg: boolean): Promise<PreparedPhoto> {
  const img = await loadImage(src);
  const ratio = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * ratio));
  const h = Math.max(1, Math.round(img.naturalHeight * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);

  // Fotos já recortadas (ex.: do catálogo) não passam pela remoção simples de fundo branco,
  // que poderia "comer" partes brancas da embalagem.
  if (removeBg && !cornersTransparent(ctx, w, h)) removeWhiteBackground(ctx, w, h);
  const cutout = cornersTransparent(ctx, w, h) || transparentShare(ctx, w, h) > 0.12;
  return { canvas: cutout ? trimTransparent(canvas) : canvas, cutout };
}

const keyOf = (src: string, removeBg: boolean) => `${removeBg ? 1 : 0}|${src}`;

export function preparePhoto(src: string, removeBg: boolean): Promise<PreparedPhoto> {
  const key = keyOf(src, removeBg);
  if (!cache.has(key)) {
    const p = prepare(src, removeBg);
    p.then((r) => ready.set(key, r)).catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key)!;
}

/** Foto já pronta (sem esperar). */
export const peekPhoto = (src: string, removeBg: boolean) => ready.get(keyOf(src, removeBg)) ?? null;
