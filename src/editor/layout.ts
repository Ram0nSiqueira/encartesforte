import type { FormatDef } from './formats';
import type { FooterStyle, Product, Settings } from './types';

// Medidas em "m" (1m = 1% do menor lado da página). Devem bater com flyer.css.
export const HEADER_M = 20;
export const PAD_M = 2.5;
export const GAP_M = 1.6;
export const FOOTER_M: Record<FooterStyle, number> = { faixa: 9, redondo: 10, compacto: 4.6 };

export interface PageLayout {
  items: Product[];
  cols: number;
  rows: number;
  /** Célula bem mais larga que alta: card em linha (foto à esquerda). */
  wide: boolean;
}

export const GRID_OPTIONS: [string, string][] = [
  ['auto', 'Automático'],
  ['1x1', '1 produto (1x1)'],
  ['2x1', '2 produtos (2x1)'],
  ['2x2', '4 produtos (2x2)'],
  ['3x2', '6 produtos (3x2)'],
  ['3x3', '9 produtos (3x3)'],
  ['4x3', '12 produtos (4x3)'],
  ['3x4', '12 produtos (3x4)'],
  ['4x4', '16 produtos (4x4)'],
  ['4x5', '20 produtos (4x5)'],
  ['5x4', '20 produtos (5x4)'],
];

function parseGrid(grid: string): { cols: number; rows: number } | null {
  const m = grid.match(/^(\d+)x(\d+)$/);
  return m ? { cols: Number(m[1]), rows: Number(m[2]) } : null;
}

function bodyArea(fmt: FormatDef, footer: FooterStyle) {
  const m = Math.min(fmt.width, fmt.height) / 100;
  return {
    m,
    w: fmt.width - 2 * PAD_M * m,
    h: fmt.height - (HEADER_M + FOOTER_M[footer] + 2 * PAD_M) * m,
  };
}

/** Escolhe colunas/linhas para n itens deixando as células próximas de um retrato leve. */
function bestGrid(n: number, w: number, h: number) {
  let best = { cols: 1, rows: n };
  let bestScore = Infinity;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    if ((rows - 1) * cols >= n) continue;
    const aspect = w / cols / (h / rows);
    const empty = (cols * rows - n) / (cols * rows);
    const score = Math.abs(Math.log(aspect / 0.95)) + 1.5 * empty;
    if (score < bestScore) {
      bestScore = score;
      best = { cols, rows };
    }
  }
  return best;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function paginate(products: Product[], settings: Settings, fmt: FormatDef): PageLayout[] {
  const area = bodyArea(fmt, settings.footer);
  const gap = GAP_M * area.m;
  const make = (items: Product[], cols: number, rows: number): PageLayout => {
    const cw = (area.w - (cols - 1) * gap) / cols;
    const ch = (area.h - (rows - 1) * gap) / rows;
    return { items, cols, rows, wide: cw / ch > 1.7 };
  };

  const fixed = parseGrid(settings.grid);
  if (products.length === 0) return [make([], fixed?.cols ?? 1, fixed?.rows ?? 1)];

  if (fixed) {
    return chunk(products, fixed.cols * fixed.rows).map((items) => make(items, fixed.cols, fixed.rows));
  }

  const pageCount = Math.ceil(products.length / fmt.maxPerPage);
  const perPage = Math.ceil(products.length / pageCount);
  return chunk(products, perPage).map((items) => {
    const g = bestGrid(items.length, area.w, area.h);
    return make(items, g.cols, g.rows);
  });
}
