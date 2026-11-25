// Logo da empresa (pasta /logo) no lugar de "SEU LOGO" / nome escrito nas artes.
import { eraseRect } from '../produto/render';
import type { EraseRect, Rect } from '../produto/template';

// Primeira imagem da pasta /logo (trocar o arquivo troca a logo em todos os encartes).
const arquivos = import.meta.glob('../../logo/*.{png,jpg,jpeg,webp,PNG,JPG,JPEG,WEBP}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const LOGO_SRC = Object.values(arquivos)[0] ?? null;

interface LocalLogo {
  /** Como apagar o texto: refazer pelas bordas ou pintar com uma cor. */
  apagar: { tipo: 'bordas'; rect: EraseRect } | { tipo: 'cor'; rect: Rect; cor: string; raio?: number };
  /** Espaço onde a logo é encaixada (centralizada, sem distorcer). */
  area: Rect;
}

/** Lugares da logo em cada modelo (coordenadas da imagem original). */
const LOCAIS: Record<string, LocalLogo[]> = {
  'de-olho-nas-ofertas': [
    { apagar: { tipo: 'bordas', rect: { x: 100, y: 956, w: 374, h: 74 } }, area: { x: 104, y: 958, w: 260, h: 70 } },
  ],
  'sabado-da-carne': [
    { apagar: { tipo: 'bordas', rect: { x: 712, y: 338, w: 290, h: 112 } }, area: { x: 726, y: 352, w: 214, h: 84 } },
  ],
  'sabadao-do-churrasco': [
    { apagar: { tipo: 'bordas', rect: { x: 815, y: 1208, w: 175, h: 84 } }, area: { x: 820, y: 1214, w: 165, h: 72 } },
  ],
  'fim-de-ano-de-ofertas': [
    // Caixa branca abaixo do título.
    { apagar: { tipo: 'cor', rect: { x: 302, y: 352, w: 176, h: 64 }, cor: '#ffffff' }, area: { x: 306, y: 352, w: 168, h: 64 } },
    { apagar: { tipo: 'bordas', rect: { x: 14, y: 1352, w: 160, h: 66 } }, area: { x: 18, y: 1356, w: 152, h: 58 } },
  ],
  'fim-de-semana-imbativel': [
    { apagar: { tipo: 'bordas', rect: { x: 68, y: 2224, w: 362, h: 144 } }, area: { x: 76, y: 2236, w: 320, h: 118 } },
  ],
  'ofertas-de-bebidas': [
    // Plaquinha branca com borda vermelha.
    { apagar: { tipo: 'cor', rect: { x: 826, y: 70, w: 238, h: 100 }, cor: '#ffffff', raio: 10 }, area: { x: 832, y: 76, w: 226, h: 88 } },
  ],
  'black-friday-hortifruti': [
    // Caixa branca com borda verde (a borda fica).
    { apagar: { tipo: 'cor', rect: { x: 74, y: 53, w: 295, h: 116 }, cor: '#ffffff', raio: 12 }, area: { x: 82, y: 60, w: 279, h: 102 } },
  ],
  'semana-do-hortifruti': [
    // Caixa branca "LOGO SUPERMERCADO".
    { apagar: { tipo: 'cor', rect: { x: 61, y: 53, w: 264, h: 74 }, cor: '#ffffff', raio: 6 }, area: { x: 66, y: 56, w: 254, h: 68 } },
  ],
  'black-friday-horti-coluna': [
    // Caixa branca "SUPERMERCADO FORTE" (mesmo lugar do Semana do Hortifrúti).
    { apagar: { tipo: 'cor', rect: { x: 61, y: 53, w: 264, h: 74 }, cor: '#ffffff', raio: 6 }, area: { x: 66, y: 56, w: 254, h: 68 } },
  ],
  'ofertas-hortifruti': [
    // Moldura tracejada "SUALOGO".
    { apagar: { tipo: 'bordas', rect: { x: 54, y: 77, w: 254, h: 74 } }, area: { x: 62, y: 84, w: 238, h: 60 } },
  ],
};

// Ofertão do Açougue / do Churrasco: mesma arte do Sabadão do Churrasco.
LOCAIS['ofertao-do-acougue'] = LOCAIS['sabadao-do-churrasco'];
LOCAIS['ofertao-do-churrasco'] = LOCAIS['sabadao-do-churrasco'];

export const temLogo = (id: string) => !!LOGO_SRC && !!LOCAIS[id];

function carregar(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

let logoPronta: Promise<HTMLCanvasElement | null> | null = null;

/** Prepara a logo: corta as sobras do fundo e deixa margem pequena com cantos arredondados. */
function prepararLogo(): Promise<HTMLCanvasElement | null> {
  if (!LOGO_SRC) return Promise.resolve(null);
  logoPronta ??= (async () => {
    const img = await carregar(LOGO_SRC);
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, W, H).data;
    // Cor do fundo: média dos 4 cantos.
    const fundo = [0, 0, 0];
    for (const [px, py] of [[3, 3], [W - 4, 3], [3, H - 4], [W - 4, H - 4]]) {
      const i = (py * W + px) * 4;
      for (let k = 0; k < 3; k++) fundo[k] += d[i + k] / 4;
    }
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const i = (py * W + px) * 4;
        const dif = Math.abs(d[i] - fundo[0]) + Math.abs(d[i + 1] - fundo[1]) + Math.abs(d[i + 2] - fundo[2]);
        if (dif > 90) {
          if (px < x0) x0 = px;
          if (px > x1) x1 = px;
          if (py < y0) y0 = py;
          if (py > y1) y1 = py;
        }
      }
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
    const m = Math.round(Math.max(x1 - x0, y1 - y0) * 0.05);
    const w = x1 - x0 + 1 + m * 2, h = y1 - y0 + 1 + m * 2;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const o = out.getContext('2d')!;
    o.beginPath();
    o.roundRect(0, 0, w, h, Math.min(w, h) * 0.12);
    o.clip();
    o.fillStyle = `rgb(${fundo.map(Math.round).join(',')})`;
    o.fillRect(0, 0, w, h);
    o.drawImage(img, x0 - m, y0 - m, w, h, 0, 0, w, h);
    return out;
  })().catch(() => null);
  return logoPronta;
}

const cache = new Map<string, HTMLCanvasElement>();

/** Arte do modelo com a logo aplicada (ou a original, se não houver logo/lugar). */
export async function baseComLogo(
  id: string, img: HTMLImageElement, largura: number, altura: number,
): Promise<HTMLImageElement | HTMLCanvasElement> {
  const locais = LOCAIS[id];
  if (!locais) return img;
  const logo = await prepararLogo();
  if (!logo) return img;
  const pronto = cache.get(id);
  if (pronto) return pronto;

  const c = document.createElement('canvas');
  c.width = largura;
  c.height = altura;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, largura, altura);
  for (const l of locais) {
    if (l.apagar.tipo === 'bordas') eraseRect(ctx, l.apagar.rect);
    else {
      const r = l.apagar.rect;
      ctx.fillStyle = l.apagar.cor;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, l.apagar.raio ?? 0);
      ctx.fill();
    }
    // Logo encaixada no espaço, centralizada, sem distorcer.
    const k = Math.min(l.area.w / logo.width, l.area.h / logo.height);
    const w = logo.width * k, h = logo.height * k;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = Math.max(2, h * 0.08);
    ctx.shadowOffsetY = Math.max(1, h * 0.03);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(logo, l.area.x + (l.area.w - w) / 2, l.area.y + (l.area.h - h) / 2, w, h);
    ctx.restore();
  }
  cache.set(id, c);
  return c;
}
