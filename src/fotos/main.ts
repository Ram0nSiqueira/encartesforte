import '@fontsource/montserrat/latin-400.css';
import '@fontsource/montserrat/latin-500.css';
import '@fontsource/montserrat/latin-700.css';
import '@fontsource/montserrat/latin-800.css';
import '@fontsource/montserrat/latin-900.css';
import '../produto/produto.css';
import './fotos.css';
import { fileToDataUrl, IMAGE_ACCEPT } from '../editor/image';
import { parseBRNumber } from '../editor/parser';
import { bancoConfigurado, buscarFotoPrincipal, esquecerFotoPrincipal, PREFIXO_IMAGENS, salvarFotoPrincipal } from './api';
import { aceitaAjusteCard, distribuirGrupos, ensureFonts, renderPhotoTemplate, type AjusteCard, type ModoCard, type TamanhoNome, type TamanhoPreco } from './render';
import { temDatas } from './datas';
// Fontes usadas nas datas escritas nas artes.
import '@fontsource/anton/latin-400.css';
import '@fontsource/oswald/latin-700.css';
import '@fontsource/poppins/latin-700.css';
import { aceitaCardsTemplate, getPhotoTemplate, maxSlots, PHOTO_TEMPLATES, slotCount, titulosProdutos, type PhotoTemplate } from './templates';

interface ProductState {
  name: string;
  price: string;
  unit: string;
  /** Código de barras (opcional): se preenchido, a busca usa ele. */
  ean: string;
  brand: string;
  photo?: string;
  /** De onde veio a foto (ex.: "Open Food Facts", "Sua foto"). */
  photoSource?: string;
  /** true quando a foto é a foto principal enviada pelo usuário. */
  photoIsPrincipal?: boolean;
  /** Fundo da foto no encarte: sem fundo, fundo branco ou a foto original. */
  fundo: Fundo;
  /** Cor do quadrado onde fica o produto (vazio = cor original do modelo). */
  cardColor: string;
}

/** Cores prontas para o quadrado do produto ('' = cor original do modelo). */
const CORES_QUADRADO: [string, string][] = [
  ['', 'Original do modelo'],
  ['#ffffff', 'Branco'],
  ['#ffc800', 'Amarelo'],
  ['#ff8a00', 'Laranja'],
  ['#e30613', 'Vermelho'],
  ['#2e9e3f', 'Verde'],
  ['#0b5cd5', 'Azul'],
  ['#142850', 'Azul-marinho'],
  ['#1a1a1a', 'Preto'],
  ['#e9ecef', 'Cinza claro'],
];

/** Paleta de cores do quadrado (prontas + "outra cor"); devolve o elemento e `marcar(cor)`. */
function criarSeletorCor(aoEscolher: (cor: string) => void) {
  const el = document.createElement('div');
  el.className = 'quadrado__cores';
  el.innerHTML =
    CORES_QUADRADO.map(
      ([c, l]) =>
        `<button type="button" class="cor${c ? '' : ' cor--original'}" data-cor="${c}" title="${l}" aria-label="${l}"${c ? ` style="background:${c}"` : ''}></button>`,
    ).join('') +
    '<label class="cor cor--outra" title="Outra cor"><input type="color" value="#ffc800" aria-label="Outra cor"><span>+</span></label>';

  el.querySelectorAll<HTMLButtonElement>('.cor[data-cor]').forEach((b) =>
    b.addEventListener('click', () => aoEscolher(b.dataset.cor ?? '')),
  );
  const outra = el.querySelector<HTMLElement>('.cor--outra')!;
  const outraInput = outra.querySelector('input')!;
  outraInput.addEventListener('input', () => aoEscolher(outraInput.value));

  const marcar = (cor: string) => {
    const pronta = CORES_QUADRADO.some(([c]) => c === cor);
    el.querySelectorAll<HTMLElement>('.cor[data-cor]').forEach((b) => b.classList.toggle('is-active', b.dataset.cor === cor));
    outra.classList.toggle('is-active', !pronta);
    outra.style.background = pronta ? '' : cor;
    if (!pronta) outraInput.value = cor;
  };
  return { el, marcar };
}

type Fundo = 'transparente' | 'branco' | 'original';

const FUNDOS: [Fundo, string][] = [
  ['transparente', 'Sem fundo'],
  ['branco', 'Fundo branco'],
  ['original', 'Fundo original'],
];

/** Endereço da foto no fundo escolhido (o banco guarda: sem fundo, branca e original). */
const photoUrl = (p: ProductState) => {
  if (p.photo?.startsWith(PREFIXO_IMAGENS) && p.fundo !== 'transparente') return p.photo.replace(/\.png$/, `-${p.fundo}.png`);
  return p.photo;
};

interface State {
  templateId: string;
  validity: string;
  /** Início das ofertas ('' = sem data de início). */
  validityStart: string;
  /** Acrescentar "ou enquanto durarem os estoques". */
  untilStock: boolean;
  /** "todos": uma cor para todos os quadrados; "cada": uma por produto. */
  squareMode: 'todos' | 'cada';
  /** Cor dos quadrados no modo "todos" ('' = original do modelo). */
  squareColor: string;
  /** Quantidade de cards por modelo (nos flexíveis). */
  cardCounts: Record<string, number>;
  /** Tamanho do nome: P/M/G/GG ou px exato. */
  nameSize: NomeModo;
  /** Tamanho do nome em px, por modelo. */
  namePx: Record<string, number>;
  /** Tamanho dos cards, por modelo. */
  cardSize: Record<string, AjusteCard>;
  /** Tamanho do preço (automático ou manual), por modelo. */
  priceSize: Record<string, TamanhoPreco>;
  products: ProductState[];
}

type NomeModo = 'p' | 'm' | 'g' | 'gg' | 'px';
const ESCALAS_NOME: Record<Exclude<NomeModo, 'px'>, number> = { p: 0.8, m: 1, g: 1.35, gg: 1.7 };

const STORAGE_KEY = 'encartesforte:encarte-fotos-v2';
const MAX_PRODUCTS = Math.max(...PHOTO_TEMPLATES.map(slotCount));

const novoProduto = (name = '', price = '', unit = 'unid'): ProductState => ({
  name, price, unit, ean: '', brand: '', fundo: 'transparente', cardColor: '',
});

const isoDate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function defaultState(): State {
  const end = new Date();
  end.setDate(end.getDate() + 6);
  const names: [string, string, string][] = [
    ['Café 3 Corações Tradicional 500g', '18,90', 'unid'],
    ['Macarrão Penne 500g', '9,90', 'unid'],
    ['Arroz Branco 1kg', '5,49', 'unid'],
    ['Leite Integral 1L', '4,99', 'unid'],
  ];
  return {
    templateId: PHOTO_TEMPLATES[0].id,
    validity: isoDate(end),
    validityStart: isoDate(new Date()),
    untilStock: true,
    squareMode: 'todos',
    squareColor: '',
    cardCounts: {},
    nameSize: 'm',
    namePx: {},
    cardSize: {},
    priceSize: {},
    products: Array.from({ length: MAX_PRODUCTS }, (_, i) => novoProduto(...(names[i] ?? []))),
  };
}

function loadState(): State {
  const d = defaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<State> | null;
    if (!saved) return d;
    return {
      templateId: saved.templateId ?? d.templateId,
      validity: saved.validity ?? d.validity,
      validityStart: saved.validityStart ?? d.validityStart,
      untilStock: saved.untilStock ?? d.untilStock,
      squareMode: saved.squareMode ?? d.squareMode,
      squareColor: saved.squareColor ?? d.squareColor,
      nameSize: saved.nameSize ?? d.nameSize,
      namePx: saved.namePx ?? d.namePx,
      cardSize: saved.cardSize ?? d.cardSize,
      priceSize: saved.priceSize ?? d.priceSize,
      // Versão antiga: uma quantidade só ("De Olho nas Ofertas").
      cardCounts:
        saved.cardCounts ??
        ((saved as { cardCount?: number }).cardCount
          ? { [PHOTO_TEMPLATES[0].id]: (saved as { cardCount?: number }).cardCount! }
          : {}),
      products: Array.from(
        { length: Math.max(d.products.length, saved.products?.length ?? 0) },
        (_, i) => ({ ...(d.products[i] ?? novoProduto()), ...(saved.products?.[i] ?? {}) }),
      ),
    };
  } catch {
    return d;
  }
}

const state = loadState();
/** true quando os botões de cards já existem. */
let acoesCardsProntas = false;
const save = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* sem espaço: segue sem salvar */
  }
  // Um card pode ter deixado (ou voltado a ficar) vazio.
  if (acoesCardsProntas) atualizarAcoesCards();
};

// ---------------------------------------------------------------------------
// Elementos
// ---------------------------------------------------------------------------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('preview');
const modelList = $('modelos');
const validityField = $('validadeField');
const validityInput = $<HTMLInputElement>('validade');
const productsBox = $('produtos');
const statusEl = $('status');
const serviceEl = $('servidor');
const downloadBtn = $<HTMLButtonElement>('baixar');
const downloadError = $('erroDownload');

const template = () => getPhotoTemplate(state.templateId);

/** O modelo permite adicionar/remover cards? */
const aceitaCards = (t: PhotoTemplate) => aceitaCardsTemplate(t);

/** Menor quantidade de cards (grupos fixos + 1 no flexível). */
const minimoCards = (t: PhotoTemplate) =>
  t.kind === 'grade' ? t.grupos.reduce((s, g) => s + (g.max > g.padrao ? 1 : g.padrao), 0) : 1;

/** Quantos cards o modelo usa (nos flexíveis, o que o usuário escolheu). */
const quantidade = (t = template()) =>
  aceitaCards(t)
    ? Math.min(Math.max(minimoCards(t), state.cardCounts[t.id] ?? slotCount(t)), maxSlots(t))
    : slotCount(t);

const definirQuantidade = (t: PhotoTemplate, n: number) => {
  state.cardCounts[t.id] = n;
};

/** Garante produtos suficientes para a quantidade atual. */
function garantirProdutos() {
  while (state.products.length < quantidade()) state.products.push(novoProduto());
}
garantirProdutos();

// ---------------------------------------------------------------------------
// Prévia
// ---------------------------------------------------------------------------
let renderTicket = 0;
let renderTimer = 0;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(render, 120);
}

/** Desenha a prévia; `waitForPhotos` espera todas as fotos (download). */
async function render(waitForPhotos = false) {
  const ticket = ++renderTicket;
  const t = template();
  statusEl.textContent = waitForPhotos ? 'Preparando a imagem final…' : 'Atualizando…';
  await ensureFonts();
  const data = state.products.slice(0, quantidade(t)).map((p) => ({
    name: p.name,
    price: parseBRNumber(p.price),
    unit: p.unit,
    photo: photoUrl(p),
    // Recorte simples de fundo claro: só se a IA falhou e o usuário pediu "sem fundo".
    removeBg: !!p.photo?.startsWith('data:') && p.photoSource === SEM_IA && p.fundo === 'transparente',
    cardColor: state.squareMode === 'todos' ? state.squareColor : p.cardColor,
  }));
  const tmp = document.createElement('canvas');
  const { pending, tamanhoNome, ganhoCard, ganhoPreco, menorPreco, precoLimitado } = await renderPhotoTemplate(tmp, t, data, {
      validity: state.validity,
      validade: { inicio: state.validityStart, fim: state.validity, estoque: state.untilStock },
      nome: tamanhoNomeAtual(t),
      card: ajusteCardAtual(t),
      preco: tamanhoPrecoAtual(t),
    }, waitForPhotos);
  if (ticket !== renderTicket) return;
  mostrarTamanhoNome(t, tamanhoNome);
  mostrarAjusteCard(t, ganhoCard, ganhoPreco);
  mostrarTamanhoPreco(t, ganhoPreco, menorPreco, precoLimitado);
  canvas.width = tmp.width;
  canvas.height = tmp.height;
  canvas.getContext('2d')!.drawImage(tmp, 0, 0);
  if (pending.length) {
    statusEl.textContent = `Carregando ${pending.length === 1 ? '1 foto' : `${pending.length} fotos`}…`;
    pending.forEach((p) => p.then(() => ticket === renderTicket && scheduleRender()));
  } else {
    statusEl.textContent = '';
  }
}

// ---------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------
for (const t of PHOTO_TEMPLATES) {
  const label = document.createElement('label');
  label.className = 'model';
  label.innerHTML = `<input type="radio" name="modelo" value="${t.id}"><img src="${t.src}" alt=""><span></span>`;
  label.querySelector('span')!.textContent = t.name;
  const radio = label.querySelector('input')!;
  radio.checked = t.id === state.templateId;
  radio.addEventListener('change', () => {
    state.templateId = t.id;
    // O novo modelo pode usar mais produtos.
    const antes = state.products.length;
    garantirProdutos();
    save();
    if (state.products.length !== antes) montarProdutos();
    syncTemplateUI();
    syncTamanhoNomeUI();
    syncAjusteCardUI();
    syncTamanhoPrecoUI();
    scheduleRender();
  });
  modelList.appendChild(label);
}

// ---------------------------------------------------------------------------
// Tamanho do nome dos produtos
// ---------------------------------------------------------------------------
const tamNomeRadios = [...document.querySelectorAll<HTMLInputElement>('input[name="tamNome"]')];
const tamNomePxBox = $('tamNomePxBox');
const tamNomePx = $<HTMLInputElement>('tamNomePx');
const tamNomePxNum = $<HTMLInputElement>('tamNomePxNum');
const tamNomeInfo = $('tamNomeInfo');
/** Último tamanho de nome desenhado (px): ponto de partida do "Personalizado". */
let ultimoTamanhoNome = 0;

/** Limite do controle em px (proporcional à largura da arte). */
const maxPxNome = (t: PhotoTemplate) => Math.max(40, Math.round(t.width * 0.07));

function tamanhoNomeAtual(t: PhotoTemplate): TamanhoNome {
  if (state.nameSize === 'px') {
    const px = state.namePx[t.id];
    if (px) return { modo: 'px', px };
    return { modo: 'escala', escala: 1 };
  }
  return { modo: 'escala', escala: ESCALAS_NOME[state.nameSize] };
}

function mostrarTamanhoNome(t: PhotoTemplate, px: number) {
  if (px) ultimoTamanhoNome = px;
  const base = `imagem final de ${t.width} × ${t.height} px`;
  tamNomeInfo.textContent = px
    ? `Maior nome no encarte: ${px} px (${base}). Nomes longos diminuem um pouco para caber.`
    : `Digite o nome dos produtos para ver o tamanho (${base}).`;
}

function syncTamanhoNomeUI() {
  const t = template();
  tamNomeRadios.forEach((r) => (r.checked = r.value === state.nameSize));
  const px = state.nameSize === 'px';
  tamNomePxBox.hidden = !px;
  const max = maxPxNome(t);
  tamNomePx.max = String(max);
  tamNomePxNum.max = String(max * 2);
  const v = state.namePx[t.id] ?? Math.max(6, ultimoTamanhoNome || Math.round(max / 3));
  tamNomePx.value = String(Math.min(v, max));
  tamNomePxNum.value = String(v);
}

tamNomeRadios.forEach((r) =>
  r.addEventListener('change', () => {
    state.nameSize = r.value as NomeModo;
    // Personalizado começa no tamanho atual.
    const t = template();
    if (state.nameSize === 'px' && !state.namePx[t.id]) state.namePx[t.id] = Math.max(6, ultimoTamanhoNome || Math.round(maxPxNome(t) / 3));
    save();
    syncTamanhoNomeUI();
    scheduleRender();
  }),
);
const definirPx = (v: number) => {
  if (!Number.isFinite(v) || v < 6) return;
  state.namePx[template().id] = Math.round(v);
  save();
  syncTamanhoNomeUI();
  scheduleRender();
};
tamNomePx.addEventListener('input', () => definirPx(Number(tamNomePx.value)));
tamNomePxNum.addEventListener('change', () => definirPx(Number(tamNomePxNum.value)));
syncTamanhoNomeUI();

// ---------------------------------------------------------------------------
// Tamanho dos cards (esticar para ocupar o espaço livre)
// ---------------------------------------------------------------------------
const tamCardBox = $('tamanhoCard');
const tamCardRadios = [...document.querySelectorAll<HTMLInputElement>('input[name="tamCard"]')];
const tamCardQuantoBox = $('tamCardQuantoBox');
const tamCardQuanto = $<HTMLInputElement>('tamCardQuanto');
const tamCardQuantoTxt = $('tamCardQuantoTxt');
const tamCardInfo = $('tamCardInfo');
const tamCardPrecoBox = $('tamCardPrecoBox');
const tamCardPreco = $<HTMLInputElement>('tamCardPreco');

function ajusteCardAtual(t: PhotoTemplate): AjusteCard {
  // Preço acompanha o card por padrão.
  const salvo = state.cardSize[t.id];
  return { preco: true, ...(salvo ?? { modo: 'padrao', quanto: 1 }) };
}

function syncAjusteCardUI() {
  const t = template();
  const ok = aceitaAjusteCard(t);
  tamCardBox.hidden = !ok;
  if (!ok) return;
  const a = ajusteCardAtual(t);
  tamCardRadios.forEach((r) => (r.checked = r.value === a.modo));
  tamCardQuantoBox.hidden = a.modo === 'padrao';
  tamCardQuanto.value = String(Math.round(a.quanto * 100));
  tamCardQuantoTxt.textContent = `Usar ${Math.round(a.quanto * 100)}% do espaço livre`;
  // No preço manual, quem manda é o bloco "Tamanho do preço".
  tamCardPrecoBox.hidden = a.modo === 'padrao' || tamanhoPrecoAtual(t).modo === 'manual';
  tamCardPreco.checked = a.preco !== false;
}

function mostrarAjusteCard(t: PhotoTemplate, ganho: { w: number; h: number }, ganhoPreco: number) {
  if (!aceitaAjusteCard(t)) return;
  const a = ajusteCardAtual(t);
  if (a.modo === 'padrao') {
    tamCardInfo.textContent = 'Os cards mantêm a proporção do modelo. Escolha uma opção para eles ocuparem o espaço que sobra (o resto do encarte não muda).';
    return;
  }
  const pct = (v: number) => Math.round((v - 1) * 100);
  const partes: string[] = [];
  if (a.modo !== 'altura' && pct(ganho.w) > 0) partes.push(`${pct(ganho.w)}% mais largos`);
  if (a.modo !== 'largura' && pct(ganho.h) > 0) partes.push(`${pct(ganho.h)}% mais altos`);
  const dir = a.modo === 'largura' ? 'ao lado' : a.modo === 'altura' ? 'acima/abaixo' : 'em volta';
  const preco = tamanhoPrecoAtual(t).modo === 'manual' ? ' Preço no tamanho manual.'
    : pct(ganhoPreco) > 0 ? ` Preço ${pct(ganhoPreco)}% maior.`
    : a.preco === false ? ' Preço no tamanho original.' : '';
  tamCardInfo.textContent = partes.length
    ? `Cards ${partes.join(' e ')}.${preco} O espaço extra vai para a foto; o nome acompanha.`
    : `Não há espaço livre ${dir} dos cards neste layout. Tente outra opção ou mude a quantidade de cards.`;
}

const definirAjusteCard = (mudar: Partial<AjusteCard>) => {
  const t = template();
  state.cardSize[t.id] = { ...ajusteCardAtual(t), ...mudar };
  save();
  syncAjusteCardUI();
  scheduleRender();
};
tamCardRadios.forEach((r) => r.addEventListener('change', () => definirAjusteCard({ modo: r.value as ModoCard })));
tamCardQuanto.addEventListener('input', () => definirAjusteCard({ quanto: Number(tamCardQuanto.value) / 100 }));
tamCardPreco.addEventListener('change', () => definirAjusteCard({ preco: tamCardPreco.checked }));
syncAjusteCardUI();

// ---------------------------------------------------------------------------
// Tamanho do preço (automático ou manual)
// ---------------------------------------------------------------------------
const tamPrecoBox = $('tamanhoPreco');
const tamPrecoRadios = [...document.querySelectorAll<HTMLInputElement>('input[name="tamPreco"]')];
const tamPrecoManualBox = $('tamPrecoManualBox');
const tamPrecoEscala = $<HTMLInputElement>('tamPrecoEscala');
const tamPrecoMenos = $<HTMLButtonElement>('tamPrecoMenos');
const tamPrecoMais = $<HTMLButtonElement>('tamPrecoMais');
const tamPrecoTxt = $('tamPrecoTxt');
const tamPrecoInfo = $('tamPrecoInfo');
const PRECO_PASSO = 5, PRECO_MIN = 60, PRECO_MAX = 200;

function tamanhoPrecoAtual(t: PhotoTemplate): TamanhoPreco {
  return state.priceSize[t.id] ?? { modo: 'auto' };
}

/** Escala manual em % (lembra o último valor mesmo voltando ao automático). */
const ultimaEscalaManual: Record<string, number> = {};
const escalaManualPct = (t: PhotoTemplate) => {
  const p = tamanhoPrecoAtual(t);
  return p.modo === 'manual' ? Math.round(p.escala * 100) : ultimaEscalaManual[t.id] ?? 100;
};

function syncTamanhoPrecoUI() {
  const t = template();
  const ok = aceitaAjusteCard(t);
  tamPrecoBox.hidden = !ok;
  if (!ok) return;
  const p = tamanhoPrecoAtual(t);
  tamPrecoRadios.forEach((r) => (r.checked = r.value === p.modo));
  tamPrecoManualBox.hidden = p.modo !== 'manual';
  const pct = escalaManualPct(t);
  tamPrecoEscala.value = String(pct);
  tamPrecoTxt.textContent = `${pct}%`;
  tamPrecoMenos.disabled = pct <= PRECO_MIN;
  tamPrecoMais.disabled = pct >= PRECO_MAX;
  // Atualiza o bloco dos cards (a opção "preço junto" some no manual).
  syncAjusteCardUI();
}

function mostrarTamanhoPreco(t: PhotoTemplate, maior: number, menor: number, limitado: boolean) {
  if (!aceitaAjusteCard(t)) return;
  const p = tamanhoPrecoAtual(t);
  if (p.modo === 'auto') {
    tamPrecoInfo.textContent = 'O preço segue o tamanho do modelo e cresce junto quando o card aumenta. Use “Manual” para escolher o tamanho.';
    return;
  }
  const pedido = Math.round(p.escala * 100);
  const aplicado = Math.round((p.escala < 1 ? menor : maior) * 100);
  tamPrecoInfo.textContent = limitado
    ? `Pedido: ${pedido}%. Neste layout o preço chega a ${aplicado}% sem sair do card nem cobrir a foto ou o nome.`
    : `Preço em ${aplicado}% do tamanho do modelo. A foto e o nome se ajustam para dar espaço.`;
}

const definirTamanhoPreco = (p: TamanhoPreco) => {
  const t = template();
  state.priceSize[t.id] = p;
  if (p.modo === 'manual') ultimaEscalaManual[t.id] = Math.round(p.escala * 100);
  save();
  syncTamanhoPrecoUI();
  scheduleRender();
};
const definirEscalaPct = (pct: number) =>
  definirTamanhoPreco({ modo: 'manual', escala: Math.min(PRECO_MAX, Math.max(PRECO_MIN, pct)) / 100 });
tamPrecoRadios.forEach((r) =>
  r.addEventListener('change', () => {
    const t = template();
    if (r.value === 'auto') {
      const atual = tamanhoPrecoAtual(t);
      if (atual.modo === 'manual') ultimaEscalaManual[t.id] = Math.round(atual.escala * 100);
      definirTamanhoPreco({ modo: 'auto' });
    } else definirEscalaPct(escalaManualPct(t));
  }),
);
tamPrecoEscala.addEventListener('input', () => definirEscalaPct(Number(tamPrecoEscala.value)));
tamPrecoMenos.addEventListener('click', () => definirEscalaPct(escalaManualPct(template()) - PRECO_PASSO));
tamPrecoMais.addEventListener('click', () => definirEscalaPct(escalaManualPct(template()) + PRECO_PASSO));
syncTamanhoPrecoUI();

validityInput.value = state.validity;
validityInput.addEventListener('input', () => {
  state.validity = validityInput.value;
  save();
  scheduleRender();
});
const validityStartInput = $<HTMLInputElement>('validadeInicio');
const untilStockInput = $<HTMLInputElement>('validadeEstoque');
validityStartInput.value = state.validityStart;
untilStockInput.checked = state.untilStock;
validityStartInput.addEventListener('input', () => {
  state.validityStart = validityStartInput.value;
  save();
  scheduleRender();
});
untilStockInput.addEventListener('change', () => {
  state.untilStock = untilStockInput.checked;
  save();
  scheduleRender();
});

// ---------------------------------------------------------------------------
// Produtos
// ---------------------------------------------------------------------------
const blocks: HTMLElement[] = [];
/** Marca, na paleta de cada produto, a cor atual do quadrado. */
const marcarCorProduto: ((cor: string) => void)[] = [];
/** Marca de foto sem a remoção de fundo da IA (falhou): usa o recorte simples. */
const SEM_IA = 'Envio manual (não salvo)';

const UNITS = ['unid', 'kg', 'g', 'pct', 'cx', 'L', 'dz', 'bdj'];
const datalist = document.createElement('datalist');
datalist.id = 'unidades';
datalist.innerHTML = UNITS.map((u) => `<option value="${u}">`).join('');
document.body.appendChild(datalist);

const isBarcode = (s: string) => /^\d{8,14}$/.test(s);

function productBlock(i: number): HTMLElement {
  const p = state.products[i];
  const el = document.createElement('section');
  el.className = 'product';
  el.innerHTML = `
    <div class="product__head">
      <h2 class="product__title">Produto ${i + 1}</h2>
      <button type="button" class="btn-link danger" data-act="remove-card" hidden>Remover este card</button>
    </div>
    <label class="field">Nome do produto <input data-k="name" maxlength="40"></label>
    <div class="product__row">
      <label class="field">Valor (R$) <input data-k="price" inputmode="decimal" maxlength="10" placeholder="0,00"></label>
      <label class="field">Unidade <input data-k="unit" list="unidades" maxlength="12"></label>
    </div>
    <label class="field">Código de barras <small>(opcional — a foto também fica salva por ele)</small>
      <input data-k="ean" inputmode="numeric" maxlength="14" placeholder="Ex.: 7896005800010">
    </label>
    <div class="photo">
      <div class="photo__current"><img alt=""><span>Sem foto</span><em class="photo__badge" hidden>sua foto</em></div>
      <div class="photo__actions">
        <label class="btn-ghost btn-gold" data-act="upload">Enviar foto<input type="file" accept="${IMAGE_ACCEPT}" hidden></label>
        <button type="button" class="btn-ghost" data-act="search">Buscar foto salva</button>
        <button type="button" class="btn-link danger" data-act="clear">Remover foto</button>
      </div>
    </div>
    <div class="fundo" role="radiogroup" aria-label="Fundo da foto">
      <span>Fundo da foto:</span>
      ${FUNDOS.map(([v, l]) => `<label><input type="radio" name="fundo-${i}" value="${v}"> ${l}</label>`).join('')}
    </div>
    <div class="quadrado" data-role="quadrado">
      <span>Cor do Card De Produtos:</span>
    </div>
    <div class="photo__principal" hidden>
      <span>Esta é a <strong>foto salva</strong> deste produto: ela aparece em qualquer aparelho ao digitar o nome.</span>
      <button type="button" class="btn-link danger" data-act="forget">Não usar mais como foto principal</button>
    </div>
    <p class="photo__source"></p>
    <p class="photo__status"></p>`;

  const input = (k: string) => el.querySelector<HTMLInputElement>(`[data-k="${k}"]`)!;
  input('name').value = p.name;
  input('price').value = p.price;
  input('unit').value = p.unit;
  input('ean').value = p.ean;
  el.querySelectorAll<HTMLInputElement>(`input[name="fundo-${i}"]`).forEach((r) => {
    r.checked = r.value === p.fundo;
    r.addEventListener('change', () => {
      p.fundo = r.value as Fundo;
      save();
      syncPhotoUI(i);
      scheduleRender();
    });
  });

  // Cor do quadrado deste produto (modo "cada produto").
  const seletor = criarSeletorCor((cor) => {
    p.cardColor = cor;
    save();
    seletor.marcar(cor);
    scheduleRender();
  });
  el.querySelector('[data-role="quadrado"]')!.appendChild(seletor.el);
  marcarCorProduto[i] = seletor.marcar;

  input('name').addEventListener('input', () => {
    p.name = input('name').value;
    save();
    scheduleRender();
  });
  input('ean').addEventListener('input', () => {
    p.ean = input('ean').value.replace(/\D/g, '');
    save();
  });
  // Enter no nome ou no código confirma a busca.
  for (const k of ['name', 'ean']) {
    input(k).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runSearch(i);
      }
    });
  }
  input('price').addEventListener('input', () => {
    p.price = input('price').value;
    input('price').classList.toggle('invalid', !!p.price.trim() && parseBRNumber(p.price) == null);
    save();
    scheduleRender();
  });
  input('price').addEventListener('blur', () => {
    const v = parseBRNumber(p.price);
    if (v != null) input('price').value = p.price = v.toFixed(2).replace('.', ',');
    save();
  });
  input('unit').addEventListener('input', () => {
    p.unit = input('unit').value;
    save();
    scheduleRender();
  });

  el.querySelector('[data-act="search"]')!.addEventListener('click', () => runSearch(i));
  el.querySelector('[data-act="remove-card"]')!.addEventListener('click', () => removerCard(i));
  el.querySelector('[data-act="forget"]')!.addEventListener('click', () => forgetPrincipal(i));
  el.querySelector('[data-act="clear"]')!.addEventListener('click', () => {
    p.photo = undefined;
    p.photoSource = undefined;
    p.photoIsPrincipal = false;
    p.brand = '';
    save();
    setStatus(i, '');
    syncPhotoUI(i);
    scheduleRender();
  });
  el.querySelector<HTMLInputElement>('input[type="file"]')!.addEventListener('change', (e) => {
    const inputEl = e.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (file) uploadPhoto(i, file);
  });

  return el;
}

function setStatus(i: number, text: string, kind: 'info' | 'erro' = 'info') {
  const s = blocks[i].querySelector<HTMLElement>('.photo__status')!;
  s.textContent = text;
  s.classList.toggle('is-error', kind === 'erro');
  // Em caso de erro, destaca o envio manual de foto.
  blocks[i].querySelector('[data-act="upload"]')!.classList.toggle('is-highlight', kind === 'erro');
}

function setBusy(i: number, busy: boolean) {
  blocks[i].classList.toggle('is-busy', busy);
  blocks[i].querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = busy));
}

function syncPhotoUI(i: number) {
  const p = state.products[i];
  const el = blocks[i];
  const img = el.querySelector<HTMLImageElement>('.photo__current img')!;
  const empty = el.querySelector<HTMLElement>('.photo__current span')!;
  img.hidden = !p.photo;
  empty.hidden = !!p.photo;
  if (p.photo) img.src = photoUrl(p)!;
  el.querySelector<HTMLElement>('.photo__badge')!.hidden = !(p.photo && p.photoIsPrincipal);
  el.querySelector<HTMLElement>('.photo__principal')!.hidden = !(p.photo && p.photoIsPrincipal);
  el.querySelector<HTMLElement>('[data-act="clear"]')!.hidden = !p.photo;

  const source = el.querySelector<HTMLElement>('.photo__source')!;
  source.textContent = p.photo && p.photoSource ? `Foto: ${p.photoSource}${p.brand ? ` · ${p.brand}` : ''}` : '';
}

/** Busca a foto salva do produto (por código de barras ou nome). */
async function runSearch(i: number) {
  const p = state.products[i];
  const block = blocks[i];
  if (block.classList.contains('is-busy')) return;
  const nome = p.name.trim();
  const codigo = isBarcode(p.ean) ? p.ean : '';
  if (nome.length < 2 && !codigo) {
    setStatus(i, 'Digite o nome do produto ou o código de barras.', 'erro');
    return;
  }
  setBusy(i, true);
  setStatus(i, `Procurando a foto salva de “${codigo || nome}”…`);
  try {
    const r = await buscarFotoPrincipal(nome, codigo);
    if (!r) {
      setStatus(i, `Ainda não há foto salva para “${codigo || nome}”. Use “Enviar foto”: ela fica salva para as próximas vezes.`, 'erro');
      return;
    }
    p.photo = r.imagem_url;
    p.photoSource = 'Foto salva';
    p.photoIsPrincipal = true;
    p.brand = '';
    if (!p.name.trim() && r.nome) {
      p.name = r.nome;
      block.querySelector<HTMLInputElement>('[data-k="name"]')!.value = r.nome;
    }
    save();
    syncPhotoUI(i);
    scheduleRender();
    setStatus(i, `Usando a foto salva (${FUNDOS.find(([v]) => v === p.fundo)![1].toLowerCase()}).`);
  } catch (e) {
    setStatus(i, (e as Error).message, 'erro');
  } finally {
    setBusy(i, false);
  }
}

/** Envio de foto: tira o fundo no navegador e salva no banco (sem banco, usa só neste encarte). */
async function uploadPhoto(i: number, file: File) {
  const p = state.products[i];
  const nome = p.name.trim();
  const codigo = isBarcode(p.ean) ? p.ean : '';
  if (!nome && !codigo) {
    setStatus(i, 'Digite o nome do produto antes de enviar a foto (ela fica salva para esse produto).', 'erro');
    return;
  }
  setBusy(i, true);
  setStatus(i, 'Tirando o fundo da foto… (alguns segundos)');
  try {
    const r = await salvarFotoPrincipal(file, nome, codigo, (a, b) =>
      setStatus(i, a >= b - 1.5
        ? 'Tirando o fundo da foto… (alguns segundos)'
        : `Preparando a remoção de fundo (só na primeira vez): ${a.toFixed(0)} de ${b.toFixed(0)} MB…`));
    if (r.salva) {
      p.photo = r.imagem_url;
      p.photoSource = 'Foto salva';
      p.photoIsPrincipal = true;
      setStatus(i, r.aviso ?? `Foto salva (com e sem fundo). Ao digitar “${nome || codigo}” em qualquer aparelho, ela aparece.`);
    } else {
      p.photo = await fileToDataUrl(new File([r.local!], 'foto.png', { type: 'image/png' }), 1000);
      p.photoSource = 'Sem fundo (não salvo)';
      p.photoIsPrincipal = false;
      setStatus(i, `${r.aviso} A foto foi usada só neste encarte, sem salvar.`, 'erro');
    }
    p.brand = '';
  } catch (e) {
    try {
      p.photo = await fileToDataUrl(file, 1000);
      p.photoSource = SEM_IA;
      p.photoIsPrincipal = false;
      setStatus(i, `${(e as Error).message} A foto foi usada só neste encarte, sem salvar.`, 'erro');
    } catch {
      setStatus(i, 'Não foi possível ler esta imagem. Use PNG, JPG ou WEBP.', 'erro');
    }
  } finally {
    setBusy(i, false);
    save();
    syncPhotoUI(i);
    scheduleRender();
  }
}

/** Deixa de usar a foto salva do produto. */
async function forgetPrincipal(i: number) {
  const p = state.products[i];
  if (!confirm('Não usar mais esta foto salva para este produto, em nenhum aparelho? (Ela continua neste encarte até você trocar.)')) return;
  setBusy(i, true);
  try {
    await esquecerFotoPrincipal(p.name.trim(), isBarcode(p.ean) ? p.ean : '');
    p.photoIsPrincipal = false;
    p.photoSource = 'Envio manual';
    save();
    setStatus(i, 'Pronto. Este produto não tem mais foto salva; envie outra quando quiser.');
  } catch (e) {
    setStatus(i, (e as Error).message, 'erro');
  } finally {
    setBusy(i, false);
    syncPhotoUI(i);
  }
}

/** (Re)cria os formulários dos produtos a partir do estado. */
function montarProdutos() {
  productsBox.replaceChildren();
  blocks.length = 0;
  marcarCorProduto.length = 0;
  state.products.forEach((_, i) => {
    const b = productBlock(i);
    blocks.push(b);
    productsBox.appendChild(b);
    syncPhotoUI(i);
    marcarCorProduto[i](state.products[i].cardColor);
  });
}
montarProdutos();

// ---------------------------------------------------------------------------
// Adicionar / remover cards (modelos com espaço flexível)
// ---------------------------------------------------------------------------
const cardsAcoes = $('cardsAcoes');
const adicionarCardBtn = $<HTMLButtonElement>('adicionarCard');
const removerVazioBtn = $<HTMLButtonElement>('removerCardVazio');
const removerTodosBtn = $<HTMLButtonElement>('removerTodosCards');
const cardsInfo = $('cardsInfo');

/** Card vazio (sem nome, preço, código e foto). */
const cardVazio = (p: ProductState) => !p.name.trim() && !p.price.trim() && !p.ean.trim() && !p.photo;

/** Índices dos cards que podem ser adicionados/removidos (só o grupo flexível). */
function faixaFlexivel(t = template()): { inicio: number; fim: number } {
  const n = quantidade(t);
  if (t.kind !== 'grade') return { inicio: 0, fim: n };
  const qtd = distribuirGrupos(t, n);
  let inicio = 0;
  for (let gi = 0; gi < t.grupos.length; gi++) {
    if (t.grupos[gi].max > t.grupos[gi].padrao) return { inicio, fim: inicio + qtd[gi] };
    inicio += qtd[gi];
  }
  return { inicio: 0, fim: 0 };
}

/** Índices dos cards vazios removíveis. */
const indicesVazios = () => {
  const { inicio, fim } = faixaFlexivel();
  return state.products.slice(0, quantidade()).flatMap((p, i) => (i >= inicio && i < fim && cardVazio(p) ? [i] : []));
};

/** Habilita/desabilita os botões de cards conforme o encarte atual. */
function atualizarAcoesCards() {
  const t = template();
  const n = quantidade(t);
  adicionarCardBtn.disabled = n >= maxSlots(t);
  const vazios = aceitaCards(t) ? indicesVazios().length : 0;
  const minimo = minimoCards(t);
  removerVazioBtn.disabled = n <= minimo || vazios === 0;
  removerVazioBtn.title = removerVazioBtn.disabled
    ? n <= minimo ? `O encarte precisa ter pelo menos ${minimo} ${minimo === 1 ? 'card' : 'cards'}.` : 'Não há card vazio: todos já têm algum dado preenchido.'
    : `Remove um card vazio (${vazios} ${vazios === 1 ? 'vazio' : 'vazios'} no encarte).`;
  // "Remover todos": só se há card com dados ou cards além do mínimo.
  const usados = state.products.slice(0, n).filter((p) => !cardVazio(p)).length;
  const extras = aceitaCards(t) ? n - minimo : 0;
  removerTodosBtn.disabled = usados === 0 && extras <= 0;
  removerTodosBtn.title = removerTodosBtn.disabled
    ? 'Os cards já estão vazios.'
    : 'Apaga os dados de todos os cards (com ou sem foto) e remove os cards extras.';
}
acoesCardsProntas = true;

removerVazioBtn.addEventListener('click', () => {
  const t = template();
  const vazios = indicesVazios();
  if (!aceitaCards(t) || quantidade(t) <= minimoCards(t) || !vazios.length) return;
  // Remove o último card vazio (nunca um com dados).
  const i = vazios[vazios.length - 1];
  state.products.splice(i, 1);
  definirQuantidade(t, quantidade(t) - 1);
  garantirProdutos();
  save();
  montarProdutos();
  syncTemplateUI();
  scheduleRender();
});

adicionarCardBtn.addEventListener('click', () => {
  const t = template();
  if (!aceitaCards(t) || quantidade(t) >= maxSlots(t)) return;
  let posicao: number;
  let novo: boolean;
  if (t.kind === 'grade') {
    // Insere no fim do grupo flexível.
    posicao = faixaFlexivel(t).fim;
    state.products.splice(posicao, 0, novoProduto());
    definirQuantidade(t, quantidade(t) + 1);
    novo = true;
  } else {
    definirQuantidade(t, quantidade(t) + 1);
    posicao = quantidade(t) - 1;
    // Reaproveita o produto que já existia nessa posição, se houver.
    novo = state.products.length < quantidade(t);
  }
  garantirProdutos();
  save();
  if (novo) montarProdutos();
  syncTemplateUI();
  scheduleRender();
  const ultimo = blocks[posicao];
  ultimo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  ultimo?.querySelector<HTMLInputElement>('[data-k="name"]')?.focus({ preventScroll: true });
});

/**
 * Remove todos os cards: apaga os dados de todos os produtos e volta ao mínimo de cards.
 * Antes, guarda a versão no histórico. As fotos do banco não são apagadas.
 */
removerTodosBtn.addEventListener('click', () => {
  const t = template();
  const n = quantidade(t);
  const usados = state.products.slice(0, n).filter((p) => !cardVazio(p)).length;
  const flex = aceitaCards(t);
  const sobra = flex ? minimoCards(t) : n;
  const msg = flex
    ? `Remover todos os ${n} cards${usados ? ` (${usados} com dados)` : ''}?\n\nTodos os dados e fotos dos cards serão apagados e o encarte ficará com ${sobra} ${sobra === 1 ? 'card vazio' : 'cards vazios'}.`
    : `Apagar os dados de todos os ${n} cards${usados ? ` (${usados} com dados)` : ''}?\n\nEste modelo tem quantidade fixa: os cards ficam vazios.`;
  if (!confirm(msg)) return;
  guardarNoHistorico('limpar');
  state.products = state.products.map(() => novoProduto());
  if (flex) definirQuantidade(t, sobra);
  garantirProdutos();
  save();
  montarProdutos();
  syncTemplateUI();
  scheduleRender();
});

function removerCard(i: number) {
  const t = template();
  if (!aceitaCards(t) || quantidade(t) <= minimoCards(t)) return;
  const nome = state.products[i].name.trim();
  if (!confirm(`Remover o card ${nome ? `“${nome}”` : `do produto ${i + 1}`}?`)) return;
  state.products.splice(i, 1);
  definirQuantidade(t, quantidade(t) - 1);
  garantirProdutos();
  save();
  montarProdutos();
  syncTemplateUI();
  scheduleRender();
}

// ---------------------------------------------------------------------------
// Cor dos quadrados: "Mesma cor para todos" ou "Escolher em cada produto"
// ---------------------------------------------------------------------------
const coresBox = $('coresQuadrados');
const corTodosBox = $('corTodos');
const corCadaDica = $('corCadaDica');
const seletorTodos = criarSeletorCor((cor) => {
  state.squareColor = cor;
  save();
  seletorTodos.marcar(cor);
  scheduleRender();
});
corTodosBox.appendChild(seletorTodos.el);
seletorTodos.marcar(state.squareColor);

coresBox.querySelectorAll<HTMLInputElement>('input[name="modoCor"]').forEach((r) => {
  r.checked = r.value === state.squareMode;
  r.addEventListener('change', () => {
    state.squareMode = r.value as State['squareMode'];
    save();
    syncTemplateUI();
    scheduleRender();
  });
});

function syncTemplateUI() {
  const t = template();
  const n = quantidade(t);
  blocks.forEach((b, i) => (b.hidden = i >= n));
  // Validade: só nos modelos com datas.
  validityField.hidden = !t.hasValidity && !temDatas(t.id);

  const flex = aceitaCards(t);
  // "Remover todos" em todos os modelos; adicionar/remover vazio só nos flexíveis.
  cardsAcoes.hidden = false;
  adicionarCardBtn.hidden = !flex;
  removerVazioBtn.hidden = !flex;
  atualizarAcoesCards();
  cardsInfo.textContent = flex ? `${n} ${n === 1 ? 'card' : 'cards'} no encarte (máximo ${maxSlots(t)}).` : '';
  const { inicio, fim } = faixaFlexivel(t);
  blocks.forEach((b, i) => {
    b.querySelector<HTMLElement>('[data-act="remove-card"]')!.hidden = !flex || n <= minimoCards(t) || i < inicio || i >= fim;
  });
  // Títulos dos produtos (ex.: "Super oferta 1").
  const titulos = titulosProdutos(t, n, distribuirGrupos);
  blocks.forEach((b, i) => (b.querySelector<HTMLElement>('.product__title')!.textContent = titulos[i] ?? `Produto ${i + 1}`));
  // A cor do card existe em todos os modelos.
  const temQuadrado = true;
  const cada = state.squareMode === 'cada';
  coresBox.hidden = !temQuadrado;
  corTodosBox.hidden = cada;
  corCadaDica.hidden = !cada;
  blocks.forEach((b) => (b.querySelector<HTMLElement>('[data-role="quadrado"]')!.hidden = !temQuadrado || !cada));
}

function checkService() {
  const ok = bancoConfigurado();
  serviceEl.className = `server-status ${ok ? 'is-on' : 'is-off'}`;
  serviceEl.textContent = ok
    ? 'Fotos salvas na nuvem: envie a foto uma vez e ela aparece em qualquer aparelho ao digitar o nome do produto.'
    : 'Banco de fotos não configurado: as fotos enviadas não ficam salvas (falta VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).';
}

// ---------------------------------------------------------------------------
// Histórico de cards: as 2 últimas versões (salvas ao remover todos e ao baixar a imagem).
// Restaurar troca a versão com os cards atuais, então nada se perde.
// ---------------------------------------------------------------------------
interface VersaoCards {
  quando: number;
  motivo: 'limpar' | 'baixar' | 'restaurar';
  templateId: string;
  quantidade: number;
  squareMode: State['squareMode'];
  squareColor: string;
  products: ProductState[];
  /** Miniatura da arte (JPEG pequeno). */
  miniatura?: string;
}

const HISTORICO_KEY = 'encartesforte:historico-cards-v1';
const HISTORICO_MAX = 2;
const historicoLista = $('historicoLista');
const historicoInfo = $('historicoInfo');

function carregarHistorico(): VersaoCards[] {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORICO_KEY) ?? '[]');
    return Array.isArray(v) ? v.slice(0, HISTORICO_MAX) : [];
  } catch {
    return [];
  }
}
let historico = carregarHistorico();

function salvarHistorico() {
  try {
    localStorage.setItem(HISTORICO_KEY, JSON.stringify(historico));
    return;
  } catch {
    /* sem espaço: tenta sem as fotos enviadas sem o banco (muito grandes) e sem miniaturas */
  }
  try {
    const leve = historico.map((v) => ({
      ...v,
      miniatura: undefined,
      products: v.products.map((p) => (p.photo?.startsWith('data:') ? { ...p, photo: undefined } : p)),
    }));
    localStorage.setItem(HISTORICO_KEY, JSON.stringify(leve));
  } catch {
    /* segue só na memória */
  }
}

/** Produtos da versão (sem os vazios do fim). */
const produtosDaVersao = (n: number) => {
  const lista = state.products.slice(0, n).map((p) => ({ ...p }));
  while (lista.length && cardVazio(lista[lista.length - 1])) lista.pop();
  return lista;
};
/** Assinatura do conteúdo (evita versões repetidas). */
const assinatura = (v: Pick<VersaoCards, 'templateId' | 'quantidade' | 'products'>) =>
  JSON.stringify([v.templateId, v.quantidade, v.products.map((p) => [p.name, p.price, p.unit, p.ean, p.photo, p.fundo, p.cardColor])]);

function miniaturaAtual(): string | undefined {
  try {
    if (!canvas.width) return undefined;
    const c = document.createElement('canvas');
    c.width = 108;
    c.height = Math.round((108 * canvas.height) / canvas.width);
    c.getContext('2d')!.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  } catch {
    return undefined; // foto de outro site sem permissão: sem miniatura
  }
}

/** Versão com os cards atuais (null se todos vazios). */
function versaoAtual(motivo: VersaoCards['motivo']): VersaoCards | null {
  const t = template();
  const n = quantidade(t);
  const products = produtosDaVersao(n);
  if (!products.some((p) => !cardVazio(p))) return null;
  return {
    quando: Date.now(), motivo, templateId: t.id, quantidade: n,
    squareMode: state.squareMode, squareColor: state.squareColor, products, miniatura: miniaturaAtual(),
  };
}

/** Põe a versão no topo (sem repetir) e mantém só as 2 últimas. */
function adicionarAoHistorico(v: VersaoCards | null) {
  if (!v) return;
  const a = assinatura(v);
  historico = [v, ...historico.filter((h) => assinatura(h) !== a)].slice(0, HISTORICO_MAX);
  salvarHistorico();
  desenharHistorico();
}

/** Guarda os cards atuais no histórico. */
function guardarNoHistorico(motivo: VersaoCards['motivo']) {
  adicionarAoHistorico(versaoAtual(motivo));
}

const MOTIVOS: Record<VersaoCards['motivo'], string> = {
  limpar: 'antes de remover todos os cards',
  baixar: 'imagem baixada',
  restaurar: 'cards trocados ao restaurar',
};

function desenharHistorico() {
  historicoLista.replaceChildren();
  historicoInfo.textContent = historico.length
    ? 'Clique em “Restaurar” para voltar os cards como estavam (os cards atuais ficam guardados aqui).'
    : 'Ainda não há versões salvas. Os cards são guardados aqui antes de “Remover todos os cards” e ao baixar a imagem (as 2 últimas).';
  historico.forEach((v, i) => {
    const modelo = PHOTO_TEMPLATES.find((t) => t.id === v.templateId);
    const usados = v.products.filter((p) => !cardVazio(p));
    const comFoto = usados.filter((p) => p.photo).length;
    const data = new Date(v.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const item = document.createElement('div');
    item.className = 'historico__item';
    item.innerHTML = `
      <img class="historico__mini" alt="">
      <div class="historico__texto"><strong></strong><span data-r="info"></span><span data-r="nomes"></span></div>
      <button type="button" class="btn-ghost btn-gold">Restaurar</button>`;
    const img = item.querySelector('img')!;
    if (v.miniatura) img.src = v.miniatura;
    else img.hidden = true;
    item.querySelector('strong')!.textContent = `${modelo?.name.replace(/\s*\(.*\)$/, '') ?? 'Modelo'} — ${v.quantidade} ${v.quantidade === 1 ? 'card' : 'cards'}`;
    item.querySelector('[data-r="info"]')!.textContent =
      `${data} · ${MOTIVOS[v.motivo]} · ${usados.length} com dados, ${comFoto} com foto`;
    const nomes = usados.map((p) => p.name.trim()).filter(Boolean);
    item.querySelector('[data-r="nomes"]')!.textContent = nomes.length ? nomes.join(', ') : '(sem nomes)';
    item.querySelector('[data-r="nomes"]')!.setAttribute('title', nomes.join(', '));
    item.querySelector('button')!.addEventListener('click', () => restaurarVersao(i));
    historicoLista.appendChild(item);
  });
}

function restaurarVersao(i: number) {
  const v = historico[i];
  if (!v) return;
  const atual = versaoAtual('restaurar');
  const modelo = PHOTO_TEMPLATES.find((t) => t.id === v.templateId);
  const msg = `Restaurar os ${v.quantidade} cards${modelo ? ` do modelo “${modelo.name.replace(/\s*\(.*\)$/, '')}”` : ''}?` +
    (atual ? '\n\nOs cards atuais vão para o histórico (dá para voltar depois).' : '');
  if (!confirm(msg)) return;

  // A versão sai do histórico e os cards atuais entram no lugar.
  historico = historico.filter((_, j) => j !== i);
  if (modelo) state.templateId = modelo.id;
  const t = template();
  state.products = v.products.map((p) => ({ ...novoProduto(), ...p }));
  if (aceitaCards(t)) definirQuantidade(t, v.quantidade);
  state.squareMode = v.squareMode ?? state.squareMode;
  state.squareColor = v.squareColor ?? state.squareColor;
  garantirProdutos();
  save();
  adicionarAoHistorico(atual);
  salvarHistorico();
  desenharHistorico();

  // Atualiza a tela.
  document.querySelectorAll<HTMLInputElement>('input[name="modelo"]').forEach((r) => (r.checked = r.value === state.templateId));
  coresBox.querySelectorAll<HTMLInputElement>('input[name="modoCor"]').forEach((r) => (r.checked = r.value === state.squareMode));
  seletorTodos.marcar(state.squareColor);
  montarProdutos();
  syncTemplateUI();
  syncTamanhoNomeUI();
  syncAjusteCardUI();
  syncTamanhoPrecoUI();
  scheduleRender();
  productsBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
desenharHistorico();

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------
downloadBtn.addEventListener('click', async () => {
  downloadError.hidden = true;
  downloadBtn.disabled = true;
  try {
    await render(true);
  } finally {
    downloadBtn.disabled = false;
  }
  // Guarda esta versão no histórico.
  guardarNoHistorico('baixar');
  try {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `encarte-${template().id}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  } catch {
    downloadError.textContent = 'Uma das fotos não permite download. Envie a foto do computador.';
    downloadError.hidden = false;
  }
});

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------
syncTemplateUI();
render();
checkService();
