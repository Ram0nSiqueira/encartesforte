import type { EraseRect, Rect, SingleProductTemplate, TextSlot } from './template';

export interface SingleProductData {
  name: string;
  price: number | null;
  unit: string;
}

const FONT = "'Montserrat', 'Arial Black', Arial, sans-serif";
const stack = (family: string) => `'${family}', 'Arial Narrow', Arial, sans-serif`;

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string) {
  if (!imageCache.has(src)) {
    imageCache.set(
      src,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      }),
    );
  }
  return imageCache.get(src)!;
}

export async function ensureFonts() {
  await Promise.all([
    document.fonts.load(`900 100px ${FONT}`),
    document.fonts.load(`800 60px ${FONT}`),
    document.fonts.load(`700 40px ${FONT}`),
    document.fonts.load(`400 100px ${stack('Anton')}`),
  ]);
}

const formatPrice = (price: number) => {
  const [i, c] = price.toFixed(2).split('.');
  return { int: Number(i).toLocaleString('pt-BR'), cents: c };
};

/** Cor média (suavizada) em cada posição ao longo de uma borda. */
function edgeColors(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  along: 'x' | 'y', length: number, radius: number,
  /** Não usa amostras além do fim da borda (lado direito/inferior). */
  clampEnd = false,
): Float32Array {
  const data = ctx.getImageData(x, y, w, h).data;
  const n = along === 'x' ? w : h;
  const depth = along === 'x' ? h : w;
  const raw = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let d = 0; d < depth; d++) {
        const px = along === 'x' ? i : d;
        const py = along === 'x' ? d : i;
        s += data[(py * w + px) * 4 + c];
      }
      raw[i * 3 + c] = s / depth;
    }
  }
  // Suaviza e recorta para o tamanho interno.
  const out = new Float32Array(length * 3);
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) {
        const idx = clampEnd ? Math.min(i + radius + k, radius + length - 1) : i + radius + k;
        s += raw[idx * 3 + c];
      }
      out[i * 3 + c] = s / (radius * 2 + 1);
    }
  }
  return out;
}

/** Apaga um retângulo refazendo o fundo a partir das 4 bordas (Coons), sem "caixa" visível. */
export function eraseRect(ctx: CanvasRenderingContext2D, r: EraseRect) {
  const depth = 4;
  const rad = 6;
  const L = edgeColors(ctx, r.x - depth, r.y - rad, depth, r.h + rad * 2, 'y', r.h, rad);
  const R = r.noRight ? L : edgeColors(ctx, r.x + r.w, r.y - rad, depth, r.h + rad * 2, 'y', r.h, rad);
  let T = edgeColors(ctx, r.x - rad, r.y - depth, r.w + rad * 2, depth, 'x', r.w, rad, r.noRight);
  if (r.noTop) {
    // Borda de cima com detalhes: usa só a cor geral (sem listras escorrendo).
    const raio = Math.max(20, Math.round(r.w * 0.12));
    const S = new Float32Array(r.w * 3);
    for (let x = 0; x < r.w; x++) {
      for (let c = 0; c < 3; c++) {
        let soma = 0, n = 0;
        for (let k = -raio; k <= raio; k++) {
          const xx = Math.min(r.w - 1, Math.max(0, x + k));
          soma += T[xx * 3 + c]; n++;
        }
        S[x * 3 + c] = soma / n;
      }
    }
    T = S;
  }
  const B = edgeColors(ctx, r.x - rad, r.y + r.h, r.w + rad * 2, depth, 'x', r.w, rad, r.noRight);

  const corner = (a: Float32Array, ai: number, b: Float32Array, bi: number, c: number) => (a[ai * 3 + c] + b[bi * 3 + c]) / 2;
  const img = ctx.createImageData(r.w, r.h);
  for (let y = 0; y < r.h; y++) {
    const v = (y + 0.5) / r.h;
    for (let x = 0; x < r.w; x++) {
      const u = (x + 0.5) / r.w;
      const i = (y * r.w + x) * 4;
      const grain = (Math.random() - 0.5) * 3;
      for (let c = 0; c < 3; c++) {
        const edges =
          (1 - v) * T[x * 3 + c] + v * B[x * 3 + c] +
          (1 - u) * L[y * 3 + c] + u * R[y * 3 + c];
        const corners =
          (1 - u) * (1 - v) * corner(T, 0, L, 0, c) +
          u * (1 - v) * corner(T, r.w - 1, R, 0, c) +
          (1 - u) * v * corner(B, 0, L, r.h - 1, c) +
          u * v * corner(B, r.w - 1, R, r.h - 1, c);
        img.data[i + c] = edges - corners + grain;
      }
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, r.x, r.y);
}

function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

interface TextoPosicionado { text: string; font: string; letterSpacing: number; x: number; y: number; top: number; bottom: number }

/** Escreve o texto no maior tamanho que cabe na caixa do slot. */
function drawFitted(ctx: CanvasRenderingContext2D, raw: string, slot: TextSlot, color: string) {
  const p = posicionarTexto(ctx, raw, slot);
  if (p) desenharTexto(ctx, p, color);
}

/** Desenha um texto já posicionado; `dy` desloca na vertical. */
function desenharTexto(ctx: CanvasRenderingContext2D, p: TextoPosicionado, color: string, dy = 0) {
  ctx.font = p.font;
  ctx.letterSpacing = `${p.letterSpacing}px`;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(p.text, p.x, p.y + dy);
  ctx.letterSpacing = '0px';
}

/** Calcula tamanho e posição do texto na caixa do slot (sem desenhar); null se vazio. */
function posicionarTexto(ctx: CanvasRenderingContext2D, raw: string, slot: TextSlot): TextoPosicionado | null {
  const text = slot.uppercase ? raw.toUpperCase() : raw;
  if (!text.trim()) return null;
  const font = (size: number) => `${slot.weight} ${size}px ${stack(slot.font)}`;
  ctx.letterSpacing = `${slot.letterSpacing ?? 0}px`;

  const measure = (size: number) => {
    ctx.font = font(size);
    const m = ctx.measureText(text);
    const ref = slot.heightRef ? ctx.measureText(slot.heightRef) : m;
    return {
      left: m.actualBoundingBoxLeft,
      width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
      ascent: ref.actualBoundingBoxAscent,
      descent: ref.actualBoundingBoxDescent,
    };
  };

  const base = measure(100);
  let size = Math.min(
    slot.maxSize,
    (100 * slot.box.w) / Math.max(base.width, 1),
    (100 * slot.box.h) / Math.max(base.ascent + base.descent, 1),
  );
  size = Math.max(slot.minSize ?? 8, size);
  const m = measure(size);

  const { box } = slot;
  const x =
    slot.align === 'left' ? box.x + m.left
    : slot.align === 'right' ? box.x + box.w - m.width + m.left
    : box.x + (box.w - m.width) / 2 + m.left;
  const textH = m.ascent + m.descent;
  const y =
    slot.valign === 'top' ? box.y + m.ascent
    : slot.valign === 'bottom' ? box.y + box.h - m.descent
    : box.y + (box.h - textH) / 2 + m.ascent;
  ctx.letterSpacing = '0px';
  return { text, font: font(size), letterSpacing: slot.letterSpacing ?? 0, x, y, top: y - m.ascent, bottom: y + m.descent };
}

function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Divide em duas linhas o mais equilibradas possível. */
function splitBalanced(ctx: CanvasRenderingContext2D, text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [text];
  let best: string[] = [text];
  let bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
    if (w < bestW) { bestW = w; best = [a, b]; }
  }
  return best;
}

interface Block { lines: string[]; size: number; weight: number; lineHeight: number }

function layoutName(ctx: CanvasRenderingContext2D, name: string, maxWidth: number): Block {
  const weight = 800;
  const maxSize = 74;
  // Tenta uma linha.
  setFont(ctx, weight, maxSize);
  const w1 = ctx.measureText(name).width;
  const one = Math.min(maxSize, (maxSize * maxWidth) / Math.max(w1, 1));
  if (one >= 52 || !name.includes(' ')) {
    return { lines: [name], size: Math.max(20, one), weight, lineHeight: 1.05 };
  }
  // Duas linhas equilibradas.
  setFont(ctx, weight, maxSize);
  const two = splitBalanced(ctx, name);
  const w2 = Math.max(...two.map((l) => ctx.measureText(l).width));
  const size = Math.min(60, (maxSize * maxWidth) / Math.max(w2, 1));
  return { lines: two, size: Math.max(20, size), weight, lineHeight: 1.02 };
}

function layoutUnit(ctx: CanvasRenderingContext2D, unit: string, maxWidth: number): Block {
  const weight = 700;
  let size = 42;
  setFont(ctx, weight, size);
  let lines = wrapWords(ctx, unit, maxWidth);
  while ((lines.length > 2 || lines.some((l) => ctx.measureText(l).width > maxWidth * 1.4)) && size > 20) {
    size -= 2;
    setFont(ctx, weight, size);
    lines = wrapWords(ctx, unit, maxWidth * 1.4);
  }
  return { lines, size, weight, lineHeight: 1.08 };
}

function drawStackedTexts(ctx: CanvasRenderingContext2D, t: SingleProductTemplate, box: Rect, data: SingleProductData) {
  const name = data.name.trim().toUpperCase();
  const unit = data.unit.trim();
  const nameBlock = name ? layoutName(ctx, name, box.w) : null;
  const unitBlock = unit ? layoutUnit(ctx, unit, 560) : null;

  const gap = nameBlock && unitBlock ? 10 : 0;
  const h = (b: Block | null) => (b ? b.lines.length * b.size * b.lineHeight : 0);
  let total = h(nameBlock) + gap + h(unitBlock);

  // Se não couber, reduz tudo proporcionalmente.
  if (total > box.h) {
    const k = box.h / total;
    if (nameBlock) nameBlock.size *= k;
    if (unitBlock) unitBlock.size *= k;
    total = box.h;
  }

  ctx.fillStyle = t.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = box.x + box.w / 2;
  let y = box.y + (box.h - total) / 2;

  for (const block of [nameBlock, unitBlock]) {
    if (!block) continue;
    setFont(ctx, block.weight, block.size);
    const lh = block.size * block.lineHeight;
    for (const line of block.lines) {
      ctx.fillText(line, cx, y + lh / 2 + block.size * 0.04);
      y += lh;
    }
    y += gap;
  }
}

function drawRaisedCentsPrice(ctx: CanvasRenderingContext2D, t: SingleProductTemplate, box: Rect, price: number | null) {
  if (price == null) return;
  const { int, cents } = formatPrice(price);
  const small = `,${cents}`;
  const ratio = 0.56; // tamanho dos centavos em relação ao inteiro
  const capH = 0.72; // altura dos algarismos em relação ao tamanho da fonte

  ctx.letterSpacing = '-2px';
  const measure = (size: number) => {
    setFont(ctx, 900, size);
    const wi = ctx.measureText(int).width;
    setFont(ctx, 900, size * ratio);
    const ws = ctx.measureText(small).width;
    return { wi, ws };
  };

  let size = box.h / capH;
  const m0 = measure(size);
  size = Math.min(size, (size * box.w) / (m0.wi + m0.ws));
  const { wi, ws } = measure(size);

  const startX = box.x + (box.w - (wi + ws)) / 2;
  const baseline = box.y + box.h / 2 + (size * capH) / 2;

  ctx.fillStyle = t.textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 900, size);
  ctx.fillText(int, startX, baseline);
  // Centavos alinhados ao topo do número inteiro.
  setFont(ctx, 900, size * ratio);
  const top = baseline - size * capH;
  ctx.fillText(small, startX + wi, top + size * ratio * capH);
  ctx.letterSpacing = '0px';
}

export async function renderSingleProduct(canvas: HTMLCanvasElement, t: SingleProductTemplate, data: SingleProductData) {
  const img = await loadImage(t.src);
  canvas.width = t.width;
  canvas.height = t.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  if (t.fundoBranco) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, t.width, t.height);
  } else {
    ctx.drawImage(img, 0, 0, t.width, t.height);
    for (const r of t.erase) eraseRect(ctx, r);
    for (const c of t.clone ?? []) ctx.putImageData(ctx.getImageData(c.sx, c.sy, c.w, c.h), c.x, c.y);
  }

  const layout = t.layout;
  if (layout.kind === 'empilhado') {
    drawStackedTexts(ctx, t, layout.textBox, data);
    drawRaisedCentsPrice(ctx, t, layout.priceBox, data.price);
  } else if (layout.unidadeAbaixoDoPreco) {
    // Preço + unidade como um bloco: unidade centralizada logo abaixo do preço,
    // e o bloco centralizado entre o topo da caixa do preço e `fim`.
    drawFitted(ctx, data.name.trim(), layout.name, t.textColor);
    const g = layout.unidadeAbaixoDoPreco;
    const un = posicionarTexto(ctx, data.unit.trim(), layout.unit);
    const pb = layout.price.box;
    const hPreco = g.fim - pb.y - (un ? layout.unit.box.h + g.espaco : 0);
    const valor = data.price != null ? formatPrice(data.price) : null;
    const pr = valor ? posicionarTexto(ctx, `${valor.int},${valor.cents}`, { ...layout.price, box: { ...pb, h: hPreco } }) : null;
    if (!pr) {
      // Sem preço: só a unidade, no lugar de sempre (embaixo).
      if (un) desenharTexto(ctx, un, t.textColor, g.fim - un.bottom);
    } else {
      const altPreco = pr.bottom - pr.top;
      const total = altPreco + (un ? g.espaco + (un.bottom - un.top) : 0);
      const topo = pb.y + (g.fim - pb.y - total) / 2;
      desenharTexto(ctx, pr, t.textColor, topo - pr.top);
      if (un) desenharTexto(ctx, un, t.textColor, topo + altPreco + g.espaco - un.top);
    }
  } else {
    drawFitted(ctx, data.name.trim(), layout.name, t.textColor);
    if (data.price != null) {
      const { int, cents } = formatPrice(data.price);
      drawFitted(ctx, `${int},${cents}`, layout.price, t.textColor);
    }
    drawFitted(ctx, data.unit.trim(), layout.unit, t.textColor);
  }
}
