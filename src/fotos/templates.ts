import deOlhoNasOfertas from '../../ImagemEnarteVertical/WhatsApp Image 2026-11-11 at 08.43.09.jpeg';
import ofertaDaSemana from '../../ImagemEnarteVertical/WhatsApp Image 2026-11-11 at 08.43.10.jpeg';
import sabadoDaCarne from '../../ImagemEnarteVertical/final.jpg';
import ofertaEspecialForte from '../../ImagemEnarteVertical/final (2).jpg';
import sabadaoChurrasco from '../../ImagemEnarteVertical/final2 (1).jpg';
import semanaDoCliente from '../../ImagemEnarteVertical/final (1).jpg';
import fimDeAno from '../../ImagemEnarteVertical/final2.jpg';
import fimDeSemanaImbativel from '../../ImagemEnarteVertical/teste.jpg';
import ofertasDeBebidas from '../../ImagemEnarteVertical/teste02.jpg';
import blackFruti from '../../ImagemEnarteVertical/10643735.jpg';
import type { EraseRect, Rect } from '../produto/template';

export interface Circle { cx: number; cy: number; r: number }

export type PhotoTemplate =
  | {
      kind: 'cartoes';
      id: string;
      name: string;
      src: string;
      width: number;
      height: number;
      /** Cartões de produto (redesenhados por completo). */
      cards: Rect[];
      radius: number;
      /** Altura da parte amarela no topo do cartão. */
      topHeight: number;
      /** Pontos para amostrar as cores originais do cartão. */
      sampleTop: { dx: number; dy: number };
      sampleBody: { dx: number; dy: number };
      priceColor: string;
      hasValidity: true;
      /**
       * Permite adicionar/remover cards: a arte é remontada com o topo (encolhendo se precisar),
       * os cards (todos do mesmo tamanho) e o rodapé (inteiro).
       */
      flex?: {
        /** Faixa da imagem original com o título/banner (pode encolher). */
        topo: { y0: number; y1: number };
        /**
         * Painel de fundo do topo (na imagem original). Quando o topo encolhe, o painel é
         * redesenhado na largura toda e o conteúdo do topo fica centralizado sobre ele.
         */
        painel: Rect & { raio: number; amostra: { x: number; y: number } };
        /** Faixa da imagem original com logo/contatos (fica inteira). */
        rodape: { y0: number; y1: number };
        /** Faixa horizontal onde os cards podem ficar. */
        area: { x: number; w: number };
        /** Espaço entre cards. */
        gap: number;
        /** Menor escala aceitável para o topo (0.45 = 45% do tamanho original). */
        escalaMinTopo: number;
        maxCards: number;
      };
    }
  | {
      kind: 'selos';
      id: string;
      name: string;
      src: string;
      width: number;
      height: number;
      /** Áreas com as fotos/selos originais, reconstruídas a partir das bordas. */
      erase: EraseRect[];
      /** Na ordem de desenho (o último fica na frente). Cada item usa o produto `index`. */
      items: { index: number; image: Rect; badge: Circle }[];
      priceColor: string;
      hasValidity: false;
    }
  | TemplateGrade;

// ---------------------------------------------------------------------------
// Modelo genérico "grade de produtos": limpa a área dos produtos da imagem original
// e desenha cada produto (foto, nome, etiqueta de preço) no estilo do modelo,
// com o layout inteligente (permite adicionar/remover cards).
// ---------------------------------------------------------------------------

/** Retângulo em frações da célula (0 a 1). */
export interface RelRect { x: number; y: number; w: number; h: number }

export interface EstiloNome {
  cor: string;
  peso: number;
  italico?: boolean;
  maiusculas?: boolean;
  /** Texto antes do nome (ex.: "• "). */
  prefixo?: string;
  maxLinhas: number;
  /** Tamanhos da fonte na célula de tamanho original (px). */
  tamanhoMax: number;
  tamanhoMin: number;
  sombra?: string;
  /** Alinhamento do texto (padrão: centro). */
  alinhar?: 'centro' | 'esquerda';
  /** Plaquinha de madeira desenhada atrás do nome (com cordinhas nas pontas). */
  placa?: { cor: string; escura: string; clara: string; corda: string };
}

export interface EstiloPreco {
  forma: 'retangulo' | 'pilula' | 'elipse';
  fundo: string;
  /** Raio dos cantos (retângulo), em fração da altura da etiqueta. */
  raio?: number;
  borda?: string;
  sombra?: boolean;
  italico?: boolean;
  /** Texto pequeno em cima (ex.: "Por apenas:"). */
  rotulo?: { texto: string; cor: string };
  /** Círculo na ponta esquerda da etiqueta, com o "R$" dentro (cor do círculo). */
  circuloMoeda?: string;
  /** Não mostrar "R$" (só o valor), como em alguns modelos. */
  semMoeda?: boolean;
  /** "R$" ao lado do número: tamanho e altura em fração do número (padrão 0.5 e 0.28). */
  moedaTamanho?: number;
  moedaSubir?: number;
  corMoeda: string;
  corInteiro: string;
  corCentavos: string;
  corUnidade: string;
  /** Onde fica a unidade: linha de baixo ou empilhada sob os centavos. */
  unidade: 'abaixo' | 'sob-centavos' | 'nenhuma';
  /** Formato da unidade: {u} = unidade digitada (ex.: "o {U}*" -> "o KG*"). */
  formatoUnidade?: string;
  /** Tamanho da unidade "abaixo", em fração da altura da etiqueta (padrão 0.12). */
  tamanhoUnidade?: number;
  /** Centavos na linha de base (padrão: elevados, alinhados ao topo do número). */
  centavosNaBase?: boolean;
  /** Tamanho dos centavos em relação ao número (padrão 0.5; 1 = mesmo tamanho). */
  centavosTamanho?: number;
  /** Proporções (em fração da altura da etiqueta). */
  tamanhoInteiro: number;
  linhaBase: number;
}

export interface EstiloCelula {
  /** Tamanho da célula no layout original (px). */
  base: { w: number; h: number };
  /** Caixa desenhada atrás do produto (opcional). A "Cor do card" muda o preenchimento. */
  caixa?: {
    fundo: string; borda?: string; larguraBorda?: number; raio: number; rect: RelRect;
    /** Sombra suave embaixo do card. */
    sombra?: boolean;
    /** Três pontinhos no canto superior esquerdo (como um "menu"). */
    pontos?: string;
  };
  foto: RelRect;
  /** Fundo atrás da foto (ex.: quadro branco dentro de um card colorido). */
  fundoFoto?: { cor: string; raio: number; rect: RelRect };
  nome: RelRect & { estilo: EstiloNome };
  preco: RelRect & { estilo: EstiloPreco };
}

export type Limpeza =
  /** `textura`: trecho limpo (tamanho múltiplo do padrão) cuja textura fina é devolvida à área. */
  | { tipo: 'coons'; rect: EraseRect; textura?: Rect }
  | { tipo: 'cor'; rect: Rect; raio: number; cor: string }
  /**
   * Fundo com duas regiões separadas por uma curva (pontos x,y medidos na arte, ligados de forma
   * suave): acima, a textura de um trecho limpo da imagem (repetida espelhada); abaixo, uma cor
   * lisa. As bordas da área se misturam suavemente com a imagem original (`suavizar` px).
   */
  | { tipo: 'curva'; rect: Rect; curva: [number, number][]; acima: Rect; abaixo: string; suavizar: number }
  /**
   * Fundo em degradê refeito a partir de colunas de referência: cada coluna é amostrada
   * inteira (sem `pontos`) ou só nas alturas livres indicadas em `pontos`; entre as colunas,
   * a cor é interpolada suavemente.
   */
  | {
      tipo: 'colunas';
      rect: Rect;
      colunas: { x: number; pontos?: number[] }[];
      /** Altura (px) da transição suave com a linha da imagem logo acima da área. */
      mesclarTopo?: number;
      /**
       * Textura do fundo (ex.: madeira): um trecho limpo da imagem cujas variações são
       * somadas ao degradê, repetido em toda a área.
       */
      detalhe?: { rect: Rect; intensidade: number };
    };

export type Forma =
  | { tipo: 'rect'; rect: Rect }
  | { tipo: 'poligono'; pontos: [number, number][] }
  /** `exceto`: partes do círculo que NÃO voltam (ex.: onde ficava um card da arte original). */
  | { tipo: 'circulo'; cx: number; cy: number; r: number; exceto?: (Rect & { raio?: number })[]; esfumar?: number };

/**
 * Parte da arte original que volta por cima da limpeza. `quando`: só no layout original
 * ('padrao', mesma quantidade de cards da arte) ou só nos outros ('outros').
 */
export type FormaRestaurar = Forma & { manterSobCards?: boolean; quando?: 'padrao' | 'outros' };

export interface GrupoGrade {
  /** Título mostrado no formulário (ex.: "Super oferta"); vazio = "Produto N". */
  titulo?: string;
  /** Área onde os cards podem ficar. */
  area: Rect;
  gapX: number;
  gapY: number;
  /** Quantidade de produtos do layout original. */
  padrao: number;
  /** Máximo de cards (igual a `padrao` = quantidade fixa). */
  max: number;
  estilo: EstiloCelula;
  /** Quanto o card pode crescer com poucos produtos (padrão: ESCALA_MAX_CARD). */
  escalaMax?: number;
}

export interface TemplateGrade {
  kind: 'grade';
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  /** Como limpar a área dos produtos da imagem original. */
  limpar: Limpeza[];
  /**
   * Partes da imagem original que voltam por cima da limpeza, atrás dos cards (decorações).
   * Por padrão, uma decoração que ficaria embaixo de um card é omitida; com `manterSobCards`
   * ela sempre volta (o card fica por cima, como no original).
   */
  restaurarAntes?: FormaRestaurar[];
  /** Partes da imagem original que voltam por cima de tudo (ex.: título que sobrepõe os produtos). */
  restaurarDepois?: FormaRestaurar[];
  /**
   * Formas redesenhadas depois da limpeza (ex.: a ponta de um selo que ficava escondida atrás
   * dos produtos). `pontos` é a linha central da borda; o interior é preenchido com uma cor ou
   * com um pedaço da própria imagem (textura), e as bordas com `contornos` (o mais largo primeiro).
   */
  desenhos?: {
    pontos: [number, number][];
    preenchimento: { cor: string } | { textura: Rect };
    contornos: { cor: string; largura: number }[];
  }[];
  grupos: GrupoGrade[];
  hasValidity: false;
}

// Coordenadas medidas em pixels em cada imagem original.
export const PHOTO_TEMPLATES: PhotoTemplate[] = [
  {
    kind: 'cartoes',
    id: 'de-olho-nas-ofertas',
    name: 'De Olho nas Ofertas (4 produtos)',
    src: deOlhoNasOfertas,
    width: 896,
    height: 1195,
    cards: [60, 257, 454, 651].map((x) => ({ x, y: 504, w: 185, h: 390 })),
    radius: 26,
    topHeight: 258,
    sampleTop: { dx: 12, dy: 140 },
    sampleBody: { dx: 90, dy: 381 },
    priceColor: '#ffc800',
    hasValidity: true,
    flex: {
      topo: { y0: 0, y1: 500 },
      painel: { x: 60, y: 60, w: 776, h: 427, raio: 28, amostra: { x: 300, y: 470 } },
      rodape: { y0: 900, y1: 1195 },
      area: { x: 60, w: 776 },
      gap: 12,
      escalaMinTopo: 0.6,
      maxCards: 12,
    },
  },
  {
    kind: 'selos',
    id: 'oferta-da-semana-acougue',
    name: 'Oferta da Semana (2 produtos)',
    src: ofertaDaSemana,
    width: 768,
    height: 1364,
    erase: [
      { x: 372, y: 630, w: 346, h: 285 }, // produto 2 (direita) + selo
      { x: 78, y: 728, w: 428, h: 368 }, // produto 1 (esquerda) + selo
    ],
    items: [
      { index: 1, image: { x: 392, y: 640, w: 300, h: 225 }, badge: { cx: 636, cy: 834, r: 76 } },
      { index: 0, image: { x: 88, y: 738, w: 410, h: 345 }, badge: { cx: 403, cy: 988, r: 81 } },
    ],
    priceColor: '#ffd200',
    hasValidity: false,
  },
  {
    kind: 'grade',
    id: 'sabado-da-carne',
    name: 'Sábado da Carne (5 produtos)',
    src: sabadoDaCarne,
    width: 1080,
    height: 1350,
    // Painel branco dos produtos: repintado (sem o selo "Chegue cedo", que ficava no meio dos produtos).
    limpar: [
      { tipo: 'cor', rect: { x: 63, y: 466, w: 956, h: 746 }, raio: 28, cor: 'rgb(252,251,249)' },
      // Parte do selo "AQUI É MAIS BARATO" que fica fora do painel (sobre o fundo).
      { tipo: 'coons', rect: { x: 16, y: 852, w: 47, h: 168, noRight: true } },
      // Frases retiradas: "NÃO ACEITAREMOS ENCOMENDAS!!!" e "ACEITAMOS CARTÕES (exceto Credishop)".
      // A textura de pontinhos do fundo (padrão de 29 px) volta a partir de um trecho limpo.
      { tipo: 'coons', rect: { x: 86, y: 344, w: 266, h: 96 }, textura: { x: 232, y: 250, w: 58, h: 58 } },
      { tipo: 'coons', rect: { x: 752, y: 170, w: 228, h: 62 }, textura: { x: 232, y: 250, w: 58, h: 58 } },
    ],
    // Selo "AQUI É MAIS BARATO" volta por cima do painel (atrás dos cards).
    restaurarAntes: [
      {
        tipo: 'poligono',
        pontos: [[22, 893], [146, 858], [168, 876], [190, 950], [186, 988], [143, 999], [129, 1015], [106, 1004], [60, 1015], [37, 1003]],
      },
    ],
    grupos: [
      {
        area: { x: 75, y: 498, w: 930, h: 700 },
        gapX: 15,
        gapY: 22,
        padrao: 5,
        max: 12,
        estilo: {
          base: { w: 300, h: 330 },
          nome: {
            x: 0.04, y: 0.0, w: 0.92, h: 0.16,
            estilo: { cor: '#141414', peso: 800, italico: true, maiusculas: true, prefixo: '• ', maxLinhas: 2, tamanhoMax: 22, tamanhoMin: 11 },
          },
          foto: { x: 0.0, y: 0.16, w: 1.0, h: 0.56 },
          preco: {
            x: 0.24, y: 0.64, w: 0.52, h: 0.34,
            estilo: {
              forma: 'retangulo', fundo: '#d00b0b', raio: 0.08, sombra: true, italico: true,
              rotulo: { texto: 'Por apenas:', cor: '#ffd400' },
              corMoeda: '#ffffff', corInteiro: '#ffd400', corCentavos: '#ffffff', corUnidade: '#ffffff',
              unidade: 'abaixo', formatoUnidade: 'o {U}*', centavosNaBase: true,
              tamanhoInteiro: 0.5, linhaBase: 0.7,
            },
          },
        },
      },
    ],
    hasValidity: false,
  },
  {
    kind: 'grade',
    id: 'oferta-especial-forte',
    name: 'Oferta Especial do Forte (9 produtos)',
    src: ofertaEspecialForte,
    width: 736,
    height: 1308,
    // Área dos produtos: fundo vermelho em degradê refeito pelas bordas da imagem e pelo centro
    // (amostrado só nas faixas livres entre as linhas de produtos).
    limpar: [
      {
        tipo: 'colunas',
        rect: { x: 0, y: 390, w: 736, h: 918 },
        colunas: [
          { x: 2 },
          { x: 368, pontos: [567, 645, 842, 930, 1127, 1250, 1300] },
          { x: 733 },
        ],
        mesclarTopo: 90,
      },
    ],
    // A ponta de baixo do hexágono do título ficava atrás das carnes: é redesenhada
    // (só abaixo do texto "DO FORTE"; o restante do hexágono é o original).
    desenhos: [
      {
        pontos: [
          [190, 384], [200.5, 390], [217.5, 400], [235, 410], [251.5, 420], [366, 487],
          [481.5, 420], [499, 410], [516, 400], [533, 390], [543, 384],
        ],
        preenchimento: { textura: { x: 250, y: 356, w: 60, h: 28 } },
        contornos: [
          { cor: 'rgb(176,33,33)', largura: 34 },
          { cor: 'rgb(126,40,0)', largura: 11 },
          { cor: 'rgb(250,200,22)', largura: 7 },
        ],
      },
    ],
    grupos: [
      {
        area: { x: 26, y: 388, w: 684, h: 840 },
        gapX: 12,
        gapY: 6,
        padrao: 9,
        max: 15,
        estilo: {
          base: { w: 220, h: 276 },
          foto: { x: 0.0, y: 0.0, w: 1.0, h: 0.54 },
          nome: {
            x: 0.03, y: 0.545, w: 0.94, h: 0.11,
            estilo: { cor: '#ffffff', peso: 600, maxLinhas: 2, tamanhoMax: 15, tamanhoMin: 9, sombra: 'rgba(0,0,0,0.35)' },
          },
          preco: {
            x: 0.09, y: 0.69, w: 0.845, h: 0.225,
            estilo: {
              forma: 'pilula', fundo: 'rgb(254,202,2)', sombra: true,
              corMoeda: 'rgb(222,11,0)', corInteiro: 'rgb(222,11,0)', corCentavos: 'rgb(222,11,0)', corUnidade: 'rgb(222,11,0)',
              unidade: 'sob-centavos', formatoUnidade: '{U}',
              tamanhoInteiro: 0.62, linhaBase: 0.76,
            },
          },
        },
      },
    ],
    hasValidity: false,
  },
  {
    kind: 'grade',
    id: 'sabadao-do-churrasco',
    name: 'Sabadão do Churrasco (6 produtos)',
    src: sabadaoChurrasco,
    width: 1080,
    height: 1350,
    // Fundo de madeira: degradê pelas bordas + textura de um trecho limpo da própria madeira.
    limpar: [
      {
        tipo: 'colunas',
        rect: { x: 0, y: 566, w: 1080, h: 624 },
        colunas: [
          { x: 2, pontos: [572, 700, 850, 1000, 1070] },
          { x: 540, pontos: [572, 850, 1150, 1180] },
          { x: 1077, pontos: [650, 800, 950, 1100, 1185] },
        ],
        detalhe: { rect: { x: 5, y: 20, w: 190, h: 230 }, intensidade: 1 },
      },
    ],
    // Carnes decorativas dos cantos voltam (os cards podem ficar por cima, como no original).
    restaurarAntes: [
      { tipo: 'poligono', pontos: [[0, 1078], [100, 1078], [100, 1140], [290, 1140], [290, 1190], [0, 1190]], manterSobCards: true },
      { tipo: 'rect', rect: { x: 995, y: 566, w: 85, h: 66 }, manterSobCards: true },
    ],
    grupos: [
      {
        area: { x: 45, y: 578, w: 968, h: 578 },
        gapX: 19,
        gapY: 10,
        padrao: 6,
        max: 12,
        estilo: {
          base: { w: 310, h: 284 },
          nome: {
            x: 0.0, y: 0.0, w: 1.0, h: 0.19,
            estilo: { cor: '#fff7f5', peso: 700, maiusculas: true, maxLinhas: 2, tamanhoMax: 26, tamanhoMin: 12 },
          },
          foto: { x: 0.0, y: 0.19, w: 1.0, h: 0.5 },
          preco: {
            x: 0.19, y: 0.665, w: 0.61, h: 0.255,
            estilo: {
              forma: 'pilula', fundo: 'rgb(171,41,51)', circuloMoeda: 'rgb(104,33,27)', italico: true,
              corMoeda: 'rgb(230,150,58)', corInteiro: 'rgb(245,160,52)', corCentavos: 'rgb(245,160,52)', corUnidade: 'rgb(245,160,52)',
              unidade: 'sob-centavos', formatoUnidade: '{U}',
              tamanhoInteiro: 0.66, linhaBase: 0.78,
            },
          },
        },
      },
    ],
    hasValidity: false,
  },
  {
    kind: 'grade',
    id: 'semana-do-cliente',
    name: 'Semana do Cliente (15 produtos)',
    src: semanaDoCliente,
    width: 864,
    height: 1080,
    // Fundo amarelo refeito (bordas + centro nas faixas livres entre as linhas de produtos).
    limpar: [
      {
        tipo: 'colunas',
        rect: { x: 0, y: 372, w: 864, h: 593 },
        colunas: [
          { x: 2, pontos: [480, 560, 650, 750, 850, 950] },
          { x: 432, pontos: [555, 745, 955] },
          { x: 861, pontos: [380, 480, 560, 650, 745, 950] },
        ],
        mesclarTopo: 130,
      },
    ],
    // Parte visível da moeda "$" da esquerda (fora dos produtos) volta inteira.
    restaurarAntes: [
      {
        tipo: 'poligono',
        manterSobCards: true,
        pontos: [
          [96, 472], [81, 467], [67, 461], [55, 453], [43, 444], [33, 432], [24, 420], [18, 406], [13, 392],
          [11, 377], [10, 362], [12, 347], [15, 333], [21, 319], [28, 306], [38, 294], [49, 283], [61, 274],
          [74, 267], [88, 262], [96, 260],
        ],
      },
    ],
    grupos: [
      {
        area: { x: 92, y: 376, w: 766, h: 585 },
        gapX: 4,
        gapY: 5,
        padrao: 15,
        max: 20,
        // Cards pequenos no original: podem crescer mais quando há poucos produtos.
        escalaMax: 3.2,
        estilo: {
          base: { w: 150, h: 185 },
          foto: { x: 0.0, y: 0.0, w: 1.0, h: 0.75 },
          nome: {
            x: 0.04, y: 0.785, w: 0.94, h: 0.14,
            estilo: { cor: '#4a2f05', peso: 600, maxLinhas: 2, tamanhoMax: 10.5, tamanhoMin: 7, alinhar: 'esquerda' },
          },
          preco: {
            x: 0.3, y: 0.52, w: 0.7, h: 0.26,
            estilo: {
              forma: 'retangulo', fundo: 'rgb(229,1,0)', raio: 0.2, sombra: true,
              corMoeda: '#ffffff', corInteiro: 'rgb(255,214,0)', corCentavos: 'rgb(255,214,0)', corUnidade: '#ffffff',
              unidade: 'abaixo', formatoUnidade: '{u}', centavosTamanho: 1,
              tamanhoInteiro: 0.56, linhaBase: 0.64,
            },
          },
        },
      },
    ],
    hasValidity: false,
  },
  {
    kind: 'grade',
    id: 'fim-de-ano-de-ofertas',
    name: 'Fim de Ano de Ofertas (4 + 2 super ofertas)',
    src: fimDeAno,
    width: 1080,
    height: 1440,
    limpar: [
      // Painel branco dos 4 produtos (os cards são redesenhados).
      { tipo: 'cor', rect: { x: 35, y: 510, w: 568, h: 792 }, raio: 0, cor: '#ffffff' },
      // Coluna amarela "SUPER OFERTA": amarelo refeito + textura listrada do próprio modelo.
      {
        tipo: 'colunas',
        rect: { x: 612, y: 492, w: 408, h: 862 },
        colunas: [
          { x: 614 },
          { x: 816, pontos: [560, 700, 1000, 1150] },
          { x: 1018 },
        ],
        detalhe: { rect: { x: 740, y: 620, w: 150, h: 150 }, intensidade: 1 },
      },
    ],
    grupos: [
      {
        area: { x: 52, y: 528, w: 530, h: 765 },
        gapX: 17,
        gapY: 32,
        padrao: 4,
        max: 8,
        estilo: {
          base: { w: 256, h: 365 },
          caixa: { fundo: '#ffffff', borda: 'rgb(190,30,30)', larguraBorda: 2, raio: 16, rect: { x: 0, y: 0, w: 1, h: 0.959 } },
          nome: {
            x: 0.05, y: 0.025, w: 0.9, h: 0.09,
            estilo: { cor: '#161616', peso: 800, maxLinhas: 2, tamanhoMax: 19, tamanhoMin: 10 },
          },
          foto: { x: 0.06, y: 0.125, w: 0.88, h: 0.6 },
          preco: {
            x: 0.207, y: 0.778, w: 0.605, h: 0.214,
            estilo: {
              forma: 'elipse', fundo: 'rgb(128,18,18)', semMoeda: true,
              corMoeda: 'rgb(255,200,10)', corInteiro: 'rgb(255,200,10)', corCentavos: 'rgb(255,200,10)', corUnidade: '#ffffff',
              unidade: 'abaixo', formatoUnidade: '{U}', tamanhoUnidade: 0.2,
              tamanhoInteiro: 0.46, linhaBase: 0.55,
            },
          },
        },
      },
      {
        titulo: 'Super oferta',
        area: { x: 612, y: 496, w: 408, h: 880 },
        gapX: 0,
        gapY: 0,
        padrao: 2,
        max: 2,
        estilo: {
          base: { w: 408, h: 440 },
          nome: {
            x: 0.05, y: 0.0, w: 0.9, h: 0.09,
            estilo: { cor: '#161616', peso: 800, maxLinhas: 2, tamanhoMax: 26, tamanhoMin: 12 },
          },
          foto: { x: 0.06, y: 0.1, w: 0.88, h: 0.58 },
          preco: {
            x: 0.21, y: 0.715, w: 0.58, h: 0.27,
            estilo: {
              forma: 'elipse', fundo: 'rgb(128,18,18)', semMoeda: true,
              corMoeda: 'rgb(255,200,10)', corInteiro: 'rgb(255,200,10)', corCentavos: 'rgb(255,200,10)', corUnidade: '#ffffff',
              unidade: 'abaixo', formatoUnidade: '{U}', tamanhoUnidade: 0.2,
              tamanhoInteiro: 0.46, linhaBase: 0.55,
            },
          },
        },
      },
    ],
    hasValidity: false,
  },
  {
    kind: 'grade',
    id: 'fim-de-semana-imbativel',
    name: 'Fim de Semana Imbatível (3 destaques + 4 produtos)',
    src: fimDeSemanaImbativel,
    width: 1800,
    height: 2400,
    // Área dos produtos refeita (laranja do topo passando para o branco), pelas bordas.
    limpar: [
      {
        tipo: 'colunas',
        rect: { x: 0, y: 840, w: 1800, h: 1350 },
        colunas: [
          { x: 3, pontos: [843, 865, 880, 900, 920, 940, 960, 980, 1000, 1100, 1250, 1760, 1900, 2050, 2185] },
          { x: 1797, pontos: [843, 865, 880, 900, 920, 940, 960, 980, 1000, 1030, 1950, 2050, 2185] },
        ],
        mesclarTopo: 20,
      },
    ],
    // Enfeites das laterais voltam.
    restaurarAntes: [
      { tipo: 'rect', rect: { x: 0, y: 1280, w: 48, h: 450 }, manterSobCards: true },
      { tipo: 'rect', rect: { x: 1748, y: 1040, w: 52, h: 880 }, manterSobCards: true },
    ],
    grupos: [
      {
        titulo: 'Destaque',
        area: { x: 78, y: 869, w: 1643, h: 696 },
        gapX: 18,
        gapY: 0,
        padrao: 3,
        max: 3,
        estilo: {
          base: { w: 531, h: 696 },
          caixa: { fundo: 'rgb(192,3,1)', raio: 40, rect: { x: 0, y: 0, w: 1, h: 0.92 } },
          fundoFoto: { cor: '#ffffff', raio: 22, rect: { x: 0.083, y: 0.13, w: 0.834, h: 0.65 } },
          nome: {
            x: 0.06, y: 0.016, w: 0.88, h: 0.1,
            estilo: { cor: '#ffffff', peso: 800, maiusculas: true, maxLinhas: 2, tamanhoMax: 30, tamanhoMin: 14 },
          },
          foto: { x: 0.1, y: 0.145, w: 0.8, h: 0.6 },
          preco: {
            x: 0.194, y: 0.779, w: 0.606, h: 0.218,
            estilo: {
              forma: 'retangulo', fundo: 'rgb(254,172,4)', raio: 0.2, sombra: true,
              corMoeda: 'rgb(190,9,2)', corInteiro: 'rgb(190,9,2)', corCentavos: 'rgb(190,9,2)', corUnidade: 'rgb(190,9,2)',
              unidade: 'sob-centavos', formatoUnidade: '{u}',
              tamanhoInteiro: 0.72, linhaBase: 0.8,
            },
          },
        },
      },
      {
        area: { x: 95, y: 1588, w: 1625, h: 585 },
        gapX: 8,
        gapY: 10,
        padrao: 4,
        max: 12,
        estilo: {
          base: { w: 400, h: 580 },
          nome: {
            x: 0.04, y: 0.01, w: 0.92, h: 0.13,
            estilo: { cor: 'rgb(140,28,34)', peso: 800, maiusculas: true, maxLinhas: 2, tamanhoMax: 26, tamanhoMin: 12 },
          },
          foto: { x: 0.04, y: 0.155, w: 0.92, h: 0.585 },
          preco: {
            x: 0.22, y: 0.736, w: 0.5625, h: 0.228,
            estilo: {
              forma: 'retangulo', fundo: 'rgb(176,8,4)', raio: 0.18, sombra: true,
              corMoeda: '#ffffff', corInteiro: '#ffffff', corCentavos: '#ffffff', corUnidade: '#ffffff',
              unidade: 'sob-centavos', formatoUnidade: '{u}',
              tamanhoInteiro: 0.72, linhaBase: 0.8,
            },
          },
        },
      },
    ],
    hasValidity: false,
  },
  {
    kind: 'grade',
    id: 'ofertas-de-bebidas',
    name: 'Ofertas de Bebidas (12 produtos)',
    src: ofertasDeBebidas,
    width: 1200,
    height: 2133,
    // Interior do painel branco (a moldura vermelha, o título e o rodapé ficam).
    limpar: [{ tipo: 'cor', rect: { x: 57, y: 378, w: 1077, h: 1657 }, raio: 0, cor: '#ffffff' }],
    grupos: [
      {
        area: { x: 57, y: 378, w: 1077, h: 1657 },
        gapX: 0,
        gapY: 0,
        padrao: 12,
        max: 16,
        escalaMax: 1.6,
        estilo: {
          base: { w: 538.5, h: 276 },
          // Cada produto num quadro com linha vermelha fina (forma a grade do modelo).
          caixa: { fundo: '#ffffff', borda: 'rgb(175,26,30)', larguraBorda: 2, raio: 0, rect: { x: 0, y: 0, w: 1, h: 1 } },
          foto: { x: 0.04, y: 0.07, w: 0.43, h: 0.86 },
          nome: {
            x: 0.52, y: 0.16, w: 0.44, h: 0.36,
            estilo: { cor: 'rgb(57,53,52)', peso: 800, maiusculas: true, maxLinhas: 3, tamanhoMax: 32, tamanhoMin: 13, alinhar: 'esquerda' },
          },
          preco: {
            x: 0.51, y: 0.56, w: 0.46, h: 0.34,
            estilo: {
              forma: 'retangulo', fundo: '#ffffff', borda: 'rgb(150,25,25)', raio: 0.15,
              corMoeda: 'rgb(168,30,17)', corInteiro: 'rgb(168,30,17)', corCentavos: 'rgb(168,30,17)', corUnidade: 'rgb(168,30,17)',
              unidade: 'abaixo', formatoUnidade: '{U}', tamanhoUnidade: 0.16, centavosTamanho: 1,
              tamanhoInteiro: 0.66, linhaBase: 0.68,
            },
          },
        },
      },
    ],
    hasValidity: false,
  },
  {
    kind: 'grade',
    id: 'black-fruti',
    name: 'Black Fruti — Hortifrúti (2 produtos)',
    src: blackFruti,
    width: 1080,
    height: 1080,
    // Fundo atrás dos cards refeito: estampa clara de frutas acima da curva e verde liso abaixo.
    limpar: [
      {
        tipo: 'curva',
        rect: { x: 148, y: 296, w: 790, h: 584 },
        curva: [[0, 607], [180, 703], [400, 776], [541, 805], [700, 815], [850, 800], [950, 700], [1000, 570], [1030, 460], [1070, 352]],
        acima: { x: 0, y: 0, w: 300, h: 260 },
        abaixo: 'rgb(150,223,2)',
        suavizar: 22,
      },
    ],
    // Maçãs desfocadas das laterais. Com 2 produtos (layout original) ficam na frente dos cards,
    // como na arte; com outra quantidade, ficam atrás (só a parte que estava fora dos cards).
    restaurarAntes: [
      { tipo: 'circulo', cx: 186, cy: 816, r: 82, exceto: [{ x: 195, y: 316, w: 340, h: 503, raio: 24 }], esfumar: 14, manterSobCards: true },
      { tipo: 'circulo', cx: 966, cy: 670, r: 142, exceto: [{ x: 548, y: 316, w: 340, h: 503, raio: 24 }], esfumar: 14, manterSobCards: true },
    ],
    // Parte de baixo do título "BLACK FRUTI", que fica por cima dos cards.
    restaurarDepois: [
      {
        tipo: 'poligono',
        pontos: [[312, 290], [752, 290], [750, 322], [738, 344], [716, 358], [362, 360], [334, 350], [318, 332]],
      },
      { tipo: 'circulo', cx: 186, cy: 816, r: 72, quando: 'padrao' },
      { tipo: 'circulo', cx: 966, cy: 670, r: 118, quando: 'padrao' },
    ],
    grupos: [
      {
        area: { x: 195, y: 316, w: 693, h: 502 },
        gapX: 13,
        gapY: 14,
        padrao: 2,
        max: 8,
        escalaMax: 1.15,
        estilo: {
          base: { w: 340, h: 502 },
          caixa: { fundo: '#95dd00', raio: 24, rect: { x: 0, y: 0, w: 1, h: 1 }, sombra: true, pontos: '#ffffff' },
          // Parte preta de baixo do card.
          fundoFoto: { cor: '#1b1b1b', raio: 24, rect: { x: 0, y: 0.466, w: 1, h: 0.534 } },
          foto: { x: 0.06, y: 0.085, w: 0.88, h: 0.47 },
          nome: {
            x: 0.05, y: 0.535, w: 0.9, h: 0.13,
            estilo: {
              cor: '#f4f4f4', peso: 800, maxLinhas: 2, tamanhoMax: 24, tamanhoMin: 10, sombra: 'rgba(0,0,0,0.55)',
              placa: { cor: '#5f6b1c', escura: '#3f4810', clara: '#8a9a33', corda: '#b9cc5a' },
            },
          },
          preco: {
            x: 0.12, y: 0.68, w: 0.76, h: 0.27,
            estilo: {
              forma: 'retangulo', fundo: 'rgba(0,0,0,0)',
              corMoeda: '#9be000', corInteiro: '#9be000', corCentavos: '#9be000', corUnidade: '#9be000',
              unidade: 'sob-centavos', formatoUnidade: '{u}', centavosTamanho: 0.42,
              moedaTamanho: 0.27, moedaSubir: 0.1,
              tamanhoInteiro: 1.15, linhaBase: 0.86,
            },
          },
        },
      },
    ],
    hasValidity: false,
  },
];

/** Título de cada produto no formulário (ex.: "Super oferta 1"); null = "Produto N". */
export function titulosProdutos(t: PhotoTemplate, total: number, distribuir: (t: TemplateGrade, n: number) => number[]): (string | null)[] {
  if (t.kind !== 'grade') return Array(total).fill(null);
  const qtd = distribuir(t, total);
  const out: (string | null)[] = [];
  t.grupos.forEach((g, gi) => {
    for (let j = 0; j < qtd[gi]; j++) out.push(g.titulo ? `${g.titulo} ${j + 1}` : null);
  });
  while (out.length < total) out.push(null);
  return out;
}

/** Quantidade padrão de produtos do modelo (nos modelos flexíveis, o usuário pode mudar). */
export const slotCount = (t: PhotoTemplate) =>
  t.kind === 'cartoes' ? t.cards.length : t.kind === 'selos' ? t.items.length : t.grupos.reduce((s, g) => s + g.padrao, 0);
export const maxSlots = (t: PhotoTemplate) =>
  t.kind === 'cartoes' ? (t.flex ? t.flex.maxCards : t.cards.length)
  : t.kind === 'selos' ? t.items.length
  : t.grupos.reduce((s, g) => s + g.max, 0);
/** O modelo permite adicionar/remover cards? */
export const aceitaCardsTemplate = (t: PhotoTemplate) =>
  (t.kind === 'cartoes' && !!t.flex) || (t.kind === 'grade' && t.grupos.some((g) => g.max > g.padrao));
export const getPhotoTemplate = (id: string) => PHOTO_TEMPLATES.find((t) => t.id === id) ?? PHOTO_TEMPLATES[0];
