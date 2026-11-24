// Datas de validade escritas nas artes ("Ofertas válidas de 00/00 até 00/00/0000...").
// O texto original é apagado e reescrito com as datas escolhidas, no mesmo lugar e estilo.
import { eraseRect } from '../produto/render';
import type { EraseRect, Rect } from '../produto/template';

export interface Validade {
  inicio: string; // yyyy-mm-dd ('' = sem início)
  fim: string; // yyyy-mm-dd
  estoque: boolean; // "ou enquanto durarem os estoques"
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function partes(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { d: String(d).padStart(2, '0'), m: String(m).padStart(2, '0'), y: String(y), mes: MESES[m - 1] };
}

/** Estilo de um texto escrito numa caixa da arte (datas, contatos). */
export interface EstiloTexto {
  caixa: Rect;
  fonte: string;
  peso: number;
  cor: string | [number, string][];
  tamanho: number; // tamanho máximo (px)
  maxLinhas: number;
  alinhar: 'esquerda' | 'centro';
  maiusculas?: boolean;
  espacamento?: number; // entre letras, em fração do tamanho
}

interface LocalData extends EstiloTexto {
  apagar: { tipo: 'bordas'; rect: EraseRect; textura?: Rect } | { tipo: 'cor'; rect: Rect; cor: string };
  /** Monta o texto a partir das datas. */
  texto: (v: Validade) => string;
}

const estoque = (v: Validade, frase: string) => (v.estoque ? ` ${frase}` : '.');

const LOCAIS: Record<string, LocalData[]> = {
  'sabadao-do-churrasco': [
    {
      apagar: { tipo: 'bordas', rect: { x: 20, y: 516, w: 346, h: 46 } },
      caixa: { x: 24, y: 518, w: 340, h: 42 },
      texto: (v) => {
        const i = partes(v.inicio), f = partes(v.fim);
        if (!f) return '';
        const de = i ? `do dia ${i.d}/${i.m} a ` : 'até ';
        return `Ofertas válidas ${de}${f.d}/${f.m}/${f.y}${estoque(v, 'ou até durarem os estoques.')}`;
      },
      fonte: 'Montserrat', peso: 500, cor: 'rgb(245,138,76)', tamanho: 18, maxLinhas: 2, alinhar: 'esquerda',
    },
  ],
  'semana-do-cliente': [
    {
      apagar: { tipo: 'bordas', rect: { x: 82, y: 140, w: 168, h: 74 } },
      caixa: { x: 86, y: 144, w: 160, h: 66 },
      texto: (v) => {
        const i = partes(v.inicio), f = partes(v.fim);
        if (!f) return '';
        const dias = i && i.m === f.m ? `para os dias ${i.d} a ${f.d} de ${f.mes}`
          : i ? `de ${i.d}/${i.m} a ${f.d}/${f.m}` : `até ${f.d} de ${f.mes}`;
        return `Oferta válida ${dias}${estoque(v, 'ou enquanto durarem os estoques')}`;
      },
      fonte: 'Poppins', peso: 700, cor: 'rgb(254,176,156)', tamanho: 13, maxLinhas: 4, alinhar: 'esquerda',
    },
  ],
  'fim-de-ano-de-ofertas': [
    {
      apagar: { tipo: 'bordas', rect: { x: 232, y: 22, w: 640, h: 24 } },
      caixa: { x: 236, y: 24, w: 632, h: 20 },
      texto: (v) => {
        const i = partes(v.inicio), f = partes(v.fim);
        if (!f) return '';
        const de = i ? `de ${i.d}/${i.m} até ` : 'até ';
        return `Ofertas válidas ${de}${f.d}/${f.m}/${f.y}${estoque(v, 'ou enquanto durarem os estoques.')}`;
      },
      fonte: 'Montserrat', peso: 700, cor: 'rgb(252,210,197)', tamanho: 15, maxLinhas: 1, alinhar: 'centro', maiusculas: true,
    },
  ],
  'ofertas-de-bebidas': [
    {
      apagar: { tipo: 'cor', rect: { x: 428, y: 2040, w: 346, h: 60 }, cor: 'rgb(230,8,16)' },
      caixa: { x: 436, y: 2046, w: 330, h: 46 },
      texto: (v) => {
        const i = partes(v.inicio), f = partes(v.fim);
        if (!f) return '';
        if (!i) return `ATÉ ${f.d} ${f.mes}`;
        return i.m === f.m ? `${i.d} A ${f.d} ${f.mes}` : `${i.d} ${i.mes.slice(0, 3)} A ${f.d} ${f.mes.slice(0, 3)}`;
      },
      fonte: 'Anton', peso: 400, cor: '#ffffff', tamanho: 42, maxLinhas: 1, alinhar: 'centro', maiusculas: true, espacamento: 0.03,
    },
  ],
  'sabado-da-carne': [
    {
      // Plaquinha de madeira clara abaixo de "CARNE".
      apagar: { tipo: 'bordas', rect: { x: 433, y: 314, w: 207, h: 49 } },
      caixa: { x: 446, y: 318, w: 182, h: 35 },
      texto: (v) => {
        const i = partes(v.inicio), f = partes(v.fim);
        if (!f) return '';
        if (i && i.d + i.m !== f.d + f.m) return i.m === f.m ? `${i.d} A ${f.d} DE ${f.mes}` : `${i.d}/${i.m} A ${f.d}/${f.m}`;
        return `${f.d} DE ${f.mes}`;
      },
      fonte: 'Oswald', peso: 700, cor: [[0, '#6a3e17'], [1, '#4a2a0e']], tamanho: 36, maxLinhas: 1, alinhar: 'centro', maiusculas: true, espacamento: 0.05,
    },
  ],
  'black-friday-hortifruti': [
    {
      // Pílula "VÁLIDO DE [00/00] A [00/00]" (o interior é refeito; a borda verde fica).
      apagar: { tipo: 'bordas', rect: { x: 1486, y: 82, w: 570, h: 50 } },
      caixa: { x: 1492, y: 86, w: 558, h: 42 },
      texto: (v) => {
        const i = partes(v.inicio), f = partes(v.fim);
        if (!f) return '';
        return i ? `Válido de ${i.d}/${i.m} a ${f.d}/${f.m}` : `Válido até ${f.d}/${f.m}`;
      },
      fonte: 'Montserrat', peso: 800, cor: 'rgb(125,220,31)', tamanho: 44, maxLinhas: 1, alinhar: 'centro', maiusculas: true, espacamento: 0.02,
    },
  ],
  'semana-do-hortifruti': [
    {
      // Rodapé verde-escuro, à esquerda.
      apagar: { tipo: 'cor', rect: { x: 40, y: 1022, w: 282, h: 46 }, cor: 'rgb(4,57,1)' },
      caixa: { x: 44, y: 1025, w: 274, h: 40 },
      texto: (v) => {
        const i = partes(v.inicio), f = partes(v.fim);
        if (!f) return '';
        const de = i ? `de ${i.d}/${i.m} até ${f.d}/${f.m}` : `até ${f.d}/${f.m}`;
        return `Ofertas válidas ${de}${v.estoque ? '\nou enquanto durarem os estoques.' : '.'}`;
      },
      fonte: 'Montserrat', peso: 700, cor: '#ffffff', tamanho: 13, maxLinhas: 2, alinhar: 'centro', maiusculas: true,
    },
  ],
  'ofertas-hortifruti': [
    {
      // Embaixo dos produtos, no painel branco.
      apagar: { tipo: 'cor', rect: { x: 150, y: 1108, w: 440, h: 38 }, cor: '#ffffff' },
      caixa: { x: 156, y: 1110, w: 428, h: 34 },
      texto: (v) => {
        const i = partes(v.inicio), f = partes(v.fim);
        if (!f) return '';
        const de = i && i.m === f.m ? `do dia ${i.d} a ${f.d}/${f.m}/${f.y}` : i ? `de ${i.d}/${i.m} a ${f.d}/${f.m}/${f.y}` : `até ${f.d}/${f.m}/${f.y}`;
        return `Ofertas válidas ${de}${v.estoque ? '\nou enquanto durarem os estoques' : ''}`;
      },
      fonte: 'Montserrat', peso: 700, cor: 'rgb(62,76,34)', tamanho: 11, maxLinhas: 2, alinhar: 'centro', maiusculas: true, espacamento: 0.22,
    },
  ],
};

LOCAIS['black-friday-horti-coluna'] = LOCAIS['semana-do-hortifruti'];

export const temDatas = (id: string) => !!LOCAIS[id];

/** Quebra o texto em até `max` linhas que caibam em `w`, no maior tamanho possível. */
function ajustar(ctx: CanvasRenderingContext2D, l: EstiloTexto, texto: string) {
  const fonte = (t: number) => `${l.peso} ${t}px '${l.fonte}', Arial, sans-serif`;
  // "\n" no texto força a quebra de linha naquele ponto.
  const paragrafos = texto.split('\n').map((p) => p.split(' '));
  for (let t = l.tamanho; t >= 6; t -= 0.5) {
    ctx.font = fonte(t);
    ctx.letterSpacing = `${(l.espacamento ?? 0) * t}px`;
    const linhas: string[] = [];
    for (const palavras of paragrafos) {
      let atual = '';
      for (const p of palavras) {
        const tent = atual ? `${atual} ${p}` : p;
        if (ctx.measureText(tent).width <= l.caixa.w || !atual) atual = tent;
        else { linhas.push(atual); atual = p; }
      }
      if (atual) linhas.push(atual);
    }
    const lh = t * 1.15;
    const cabe = linhas.length <= l.maxLinhas && linhas.every((x) => ctx.measureText(x).width <= l.caixa.w) && linhas.length * lh <= l.caixa.h + t * 0.2;
    if (cabe) return { linhas, t, lh, fonte: fonte(t) };
  }
  return null;
}

const cache = new Map<string, HTMLCanvasElement>();

/** Imagem base com as datas escritas (cache por modelo + datas). */
export async function baseComDatas(
  id: string, img: HTMLImageElement | HTMLCanvasElement, largura: number, altura: number, v: Validade | undefined,
): Promise<HTMLImageElement | HTMLCanvasElement> {
  const locais = LOCAIS[id];
  if (!locais || !v || !v.fim) return img;
  const chave = `${id}|${v.inicio}|${v.fim}|${v.estoque}`;
  const pronto = cache.get(chave);
  if (pronto) return pronto;
  await Promise.all(locais.map((l) => document.fonts.load(`${l.peso} 20px '${l.fonte}'`).catch(() => null)));

  const c = document.createElement('canvas');
  c.width = largura;
  c.height = altura;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, largura, altura);

  for (const l of locais) {
    const r = l.apagar.rect;
    if (l.apagar.tipo === 'cor') {
      ctx.fillStyle = l.apagar.cor;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    } else {
      eraseRect(ctx, r);
      const q = l.apagar.textura;
      if (q) {
        // Devolve a textura (veio da madeira) somando o detalhe de um trecho limpo.
        const td = ctx.getImageData(q.x, q.y, q.w, q.h).data;
        const src = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
        src.canvas.width = largura; src.canvas.height = altura;
        src.drawImage(img, 0, 0, largura, altura);
        const orig = src.getImageData(q.x, q.y, q.w, q.h).data;
        const media = [0, 0, 0];
        for (let i = 0; i < orig.length; i += 4) for (let k = 0; k < 3; k++) media[k] += orig[i + k];
        for (let k = 0; k < 3; k++) media[k] /= orig.length / 4;
        const area = ctx.getImageData(r.x, r.y, r.w, r.h);
        for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
          const ti = (((y % q.h) * q.w) + (x % q.w)) * 4;
          const i = (y * r.w + x) * 4;
          for (let k = 0; k < 3; k++) area.data[i + k] += orig[ti + k] - media[k];
        }
        ctx.putImageData(area, r.x, r.y);
        void td;
      }
    }

    escrever(ctx, l, l.texto(v));
  }
  if (cache.size > 30) cache.clear();
  cache.set(chave, c);
  return c;
}

/** Escreve o texto na caixa, no maior tamanho que cabe (quebrando em linhas). */
export function escrever(ctx: CanvasRenderingContext2D, l: EstiloTexto, texto: string) {
  if (!texto) return;
  if (l.maiusculas) texto = texto.toUpperCase();
  const a = ajustar(ctx, l, texto);
  if (a) {
    ctx.save();
    ctx.font = a.fonte;
    ctx.letterSpacing = `${(l.espacamento ?? 0) * a.t}px`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = l.alinhar === 'centro' ? 'center' : 'left';
    if (typeof l.cor === 'string') ctx.fillStyle = l.cor;
    else {
      const g = ctx.createLinearGradient(0, l.caixa.y, 0, l.caixa.y + l.caixa.h);
      for (const [p, cor] of l.cor) g.addColorStop(p, cor);
      ctx.fillStyle = g;
    }
    const total = a.linhas.length * a.lh;
    const y0 = l.caixa.y + (l.caixa.h - total) / 2;
    const x = l.alinhar === 'centro' ? l.caixa.x + l.caixa.w / 2 : l.caixa.x;
    a.linhas.forEach((linha, i) => ctx.fillText(linha, x, y0 + i * a.lh + a.t * 0.9));
    ctx.restore();
  }
}
