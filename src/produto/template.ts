import ofertaEspecial from '../../ImagemEnarteVertical/1d0fe859-dd6f-430a-b96e-5f981ca5870b.png';
import placaHorizontal from '../../ImagemEnarteVertical/175d7511-8be7-437a-b227-4a0e36b1841d.jpg';

export interface Rect { x: number; y: number; w: number; h: number }

export interface EraseRect extends Rect {
  /** Não usa a borda direita como referência (ex.: texto encostado na borda do papel). */
  noRight?: boolean;
  /** Borda de cima com detalhes: usa só a cor geral dela. */
  noTop?: boolean;
}

/** Um texto que se ajusta automaticamente dentro de uma caixa. */
export interface TextSlot {
  box: Rect;
  font: string;
  weight: number;
  maxSize: number;
  minSize?: number;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'center' | 'bottom';
  /** Texto para medir a altura (linha de base estável). */
  heightRef?: string;
  uppercase?: boolean;
  letterSpacing?: number;
}

export type TemplateLayout =
  | {
      /** Nome + unidade empilhados; preço com centavos menores e elevados. */
      kind: 'empilhado';
      textBox: Rect;
      priceBox: Rect;
    }
  | {
      /** Cada informação numa caixa própria, ajustada ao espaço. */
      kind: 'caixas';
      name: TextSlot;
      price: TextSlot;
      unit: TextSlot;
      /**
       * Unidade centralizada logo abaixo do preço (usa x/largura/altura de `unit.box`).
       * O bloco preço + unidade fica centralizado entre o topo da caixa do preço e `fim`.
       */
      unidadeAbaixoDoPreco?: { espaco: number; fim: number };
    };

export interface SingleProductTemplate {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  textColor: string;
  /** Áreas com o texto original, apagadas antes de desenhar. */
  erase: EraseRect[];
  /** Cópias de trechos limpos da imagem por cima de áreas difíceis (ex.: borda do papel). */
  clone?: { sx: number; sy: number; x: number; y: number; w: number; h: number }[];
  /** Fundo todo branco (não usa a imagem do modelo; `erase`/`clone` são ignorados). */
  fundoBranco?: boolean;
  layout: TemplateLayout;
}

const ANTON = 'Anton';

// Coordenadas medidas em pixels em cada imagem original.
export const TEMPLATES: SingleProductTemplate[] = [
  {
    id: 'oferta-especial-vertical',
    name: 'Oferta Especial',
    src: ofertaEspecial,
    width: 928,
    height: 1152,
    textColor: '#111111',
    erase: [
      { x: 100, y: 378, w: 730, h: 172 }, // nome + unidade
      { x: 282, y: 660, w: 372, h: 194 }, // preço
    ],
    layout: {
      kind: 'empilhado',
      textBox: { x: 104, y: 382, w: 720, h: 166 },
      priceBox: { x: 292, y: 668, w: 350, h: 180 },
    },
  },
  {
    id: 'placa-horizontal',
    name: 'Placa de preço',
    src: placaHorizontal,
    width: 1376,
    height: 768,
    textColor: '#0a0a0a',
    // Fundo todo branco; textos com ~90 px de margem nas laterais (não cortam na impressão).
    fundoBranco: true,
    erase: [],
    layout: {
      kind: 'caixas',
      name: {
        box: { x: 90, y: 32, w: 1196, h: 106 }, // espaço em cima para acentos (Ê, Ã…)
        font: ANTON, weight: 400, maxSize: 260, minSize: 50,
        align: 'center', valign: 'bottom', heightRef: 'Hbdhl',
      },
      // Preço grande: ocupa do nome até a unidade, na largura quase toda.
      price: {
        box: { x: 140, y: 166, w: 1096, h: 586 },
        font: ANTON, weight: 400, maxSize: 900,
        align: 'center', valign: 'center', letterSpacing: 4,
      },
      // Unidade centralizada embaixo do preço.
      unit: {
        box: { x: 140, y: 0, w: 1096, h: 56 },
        font: ANTON, weight: 400, maxSize: 130, minSize: 14,
        align: 'center', valign: 'top', heightRef: 'kg',
      },
      unidadeAbaixoDoPreco: { espaco: 8, fim: 752 },
    },
  },
];

export const getTemplate = (id: string) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
