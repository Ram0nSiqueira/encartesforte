import type { Product } from './types';

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Converte "1.299,90", "49,90", "R$ 4.99" em número. */
export function parseBRNumber(input: string): number | null {
  let t = input.replace(/R\$|\s/gi, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const v = Number(t);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

export const formatNumberBR = (v: number | null): string => (v == null ? '' : v.toFixed(2).replace('.', ','));

export function splitPrice(v: number): { int: string; cents: string } {
  const [i, c] = v.toFixed(2).split('.');
  return { int: Number(i).toLocaleString('pt-BR'), cents: c };
}

const PRICE_TOKEN = /(R\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\d)/gi;
const TRAILING_CONNECTORS = /[\s\-:]+(de|por|apenas|s[oó]|a partir de|r\$)?\s*$/i;
const UNIT_AT_END = /\s+(kg|g|un|und|unid|unidade|l|lt|litro|pct|pacote|cx|caixa|dz|duzia|dúzia|bandeja)\.?$/i;

const UNIT_NORMALIZE: Record<string, string> = {
  kg: 'kg', g: 'g', un: 'un', und: 'un', unid: 'un', unidade: 'un',
  l: 'L', lt: 'L', litro: 'L', pct: 'pct', pacote: 'pct', cx: 'cx', caixa: 'cx',
  dz: 'dz', duzia: 'dz', 'dúzia': 'dz', bandeja: 'bdj',
};

interface PriceHit { start: number; end: number; value: number }

/**
 * Interpreta uma linha como:
 *   "Picanha kg R$ 49,90"
 *   "Cerveja lata 350ml de R$ 4,99 por R$ 3,99"
 *   "Fraldinha bovina 1kg"
 */
export function parseLine(line: string): Omit<Product, 'id'> | null {
  const raw = line.trim().replace(/\s+/g, ' ');
  if (!raw) return null;

  const hits: PriceHit[] = [];
  for (const m of raw.matchAll(PRICE_TOKEN)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const hasCurrency = Boolean(m[1]);
    const hasDecimals = /[.,]\d{1,2}$/.test(m[2]);
    const glued = /^[a-zA-ZÀ-ÿ]/.test(raw.slice(end)); // ex.: 1,5kg, 350ml
    if (hasCurrency || (hasDecimals && !glued)) {
      const value = parseBRNumber(m[2]);
      if (value != null) hits.push({ start, end, value });
    }
  }

  let name = (hits.length ? raw.slice(0, hits[0].start) : raw).trim();
  let tail = hits.length ? raw.slice(hits[hits.length - 1].end).trim() : '';

  let prev = '';
  while (prev !== name) {
    prev = name;
    name = name.replace(TRAILING_CONNECTORS, '').trim();
  }

  let unit = '';
  const unitInName = name.match(UNIT_AT_END);
  if (unitInName) {
    unit = UNIT_NORMALIZE[unitInName[1].toLowerCase()] ?? unitInName[1];
    name = name.slice(0, unitInName.index).trim();
  }
  tail = tail.replace(/^\/\s*/, '');
  const unitInTail = tail.match(/^(kg|g|un|und|unid|l|lt|pct|cx|dz)\b/i);
  if (unitInTail) unit = UNIT_NORMALIZE[unitInTail[1].toLowerCase()] ?? unitInTail[1];

  let price: number | null = null;
  let oldPrice: number | null = null;
  if (hits.length === 1) price = hits[0].value;
  else if (hits.length >= 2) {
    oldPrice = hits[hits.length - 2].value;
    price = hits[hits.length - 1].value;
    if (oldPrice <= price) oldPrice = null;
  }

  if (!name) name = 'Produto';
  return { name, price, oldPrice, unit };
}

export function parseProductList(text: string): Product[] {
  return text
    .split(/\r?\n/)
    .map(parseLine)
    .filter((p): p is Omit<Product, 'id'> => p !== null)
    .map((p) => ({ ...p, id: newId() }));
}

export const SAMPLE_LIST = [
  'Picanha bovina kg R$ 49,90',
  'Arroz tipo 1 5kg R$ 22,90',
  'Feijão carioca 1kg R$ 7,49',
  'Café torrado 500g de R$ 18,90 por R$ 15,99',
  'Leite integral 1L R$ 4,79',
  'Cerveja lata 350ml de R$ 4,99 por R$ 3,99',
  'Banana prata kg R$ 5,99',
  'Frango inteiro kg R$ 11,98',
  'Óleo de soja 900ml R$ 6,99',
].join('\n');
