// Contatos do Supermercado Forte escritos nas artes que vêm com dados de exemplo
// (telefone, WhatsApp, endereço, site). Os dados certos:
//   Telefone: 3531-1618 · WhatsApp: (32) 98465-4138
//   Endereço: Av. José Rezende Brando, Nº 801 — Bom Pastor, Ubá/MG
import { eraseRect } from '../produto/render';
import type { EraseRect, Rect } from '../produto/template';
import { escrever, type EstiloTexto } from './datas';
// Mesma arte do "Semana do Hortifrúti", já com o rodapé do Forte.
import rodapeForte810 from '../../ImagemEnarteVertical/final3.jpg';

export const CONTATOS = {
  telefone: '3531-1618',
  whatsapp: '(32) 98465-4138',
  endereco: 'Av. José Rezende Brando, Nº 801',
  bairroCidade: 'Bom Pastor - Ubá/MG',
  instagram: '@super_mercadoforte',
};

type Local =
  /** Apaga (refazendo o fundo pelas bordas) e escreve os textos no mesmo estilo da arte. */
  | { tipo: 'texto'; apagar: EraseRect[]; textos: (EstiloTexto & { texto: string })[] }
  /** Copia um trecho de outra arte igual que já tem os contatos certos (mesmo lugar). */
  | { tipo: 'copiar'; de: string; rect: Rect };

const branco = (caixa: Rect, texto: string, peso: number, tamanho: number, maxLinhas = 1): EstiloTexto & { texto: string } => ({
  caixa, texto, fonte: 'Montserrat', peso, cor: '#ffffff', tamanho, maxLinhas, alinhar: 'esquerda',
});

const LOCAIS: Record<string, Local[]> = {
  'black-fruti': [
    {
      tipo: 'texto',
      apagar: [
        { x: 262, y: 908, w: 285, h: 84 }, // site + endereço
        { x: 636, y: 926, w: 204, h: 64 }, // telefones
      ],
      textos: [
        branco({ x: 268, y: 910, w: 272, h: 22 }, CONTATOS.instagram, 800, 19),
        branco({ x: 268, y: 940, w: 272, h: 48 }, `${CONTATOS.endereco}\n${CONTATOS.bairroCidade}`, 500, 18, 2),
        branco({ x: 642, y: 930, w: 196, h: 56 }, `${CONTATOS.whatsapp}\n${CONTATOS.telefone}`, 500, 27, 2),
      ],
    },
  ],
  'semana-do-hortifruti': [{ tipo: 'copiar', de: rodapeForte810, rect: { x: 340, y: 1018, w: 460, h: 56 } }],
};

export const temContatos = (id: string) => !!LOCAIS[id];

function carregar(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

const cache = new Map<string, HTMLCanvasElement>();

/** Imagem base com os contatos certos do Forte (ou a mesma imagem, se a arte já estiver certa). */
export async function baseComContatos(
  id: string, img: HTMLImageElement | HTMLCanvasElement, largura: number, altura: number,
): Promise<HTMLImageElement | HTMLCanvasElement> {
  const locais = LOCAIS[id];
  if (!locais) return img;
  const pronto = cache.get(id);
  if (pronto) return pronto;
  await document.fonts.load("500 20px 'Montserrat'").catch(() => null);
  await document.fonts.load("800 20px 'Montserrat'").catch(() => null);

  const c = document.createElement('canvas');
  c.width = largura;
  c.height = altura;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, largura, altura);
  for (const l of locais) {
    if (l.tipo === 'copiar') {
      const fonte = await carregar(l.de);
      const r = l.rect;
      ctx.drawImage(fonte, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    } else {
      for (const r of l.apagar) eraseRect(ctx, r);
      for (const t of l.textos) escrever(ctx, t, t.texto);
    }
  }
  cache.set(id, c);
  return c;
}
