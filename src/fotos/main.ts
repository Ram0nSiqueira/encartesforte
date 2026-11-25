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
import { aceitaAjusteCard, distribuirGrupos, ensureFonts, renderPhotoTemplate, type AjusteCard, type ModoCard, type TamanhoNome } from './render';
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

/**
 * Paleta de cores do quadrado (cores prontas + "outra cor").
 * Devolve o elemento e uma função para marcar a cor atual.
 */
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

/** Endereço da foto no fundo escolhido (o banco guarda as três versões: sem fundo, branca e original). */
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
  /** "todos": uma cor para todos os quadrados; "cada": cor escolhida em cada produto. */
  squareMode: 'todos' | 'cada';
  /** Cor de todos os quadrados no modo "todos" ('' = cor original do modelo). */
  squareColor: string;
  /** Quantidade de cards nos modelos que permitem adicionar/remover cards. */
  cardCounts: Record<string, number>;
  /** Tamanho do nome dos produtos: P/M/G/GG (escala sobre o modelo) ou px exato. */
  nameSize: NomeModo;
  /** Tamanho em px escolhido em cada modelo (cada arte tem uma resolução). */
  namePx: Record<string, number>;
  /** Tamanho dos cards escolhido em cada modelo (cada arte tem um espaço livre diferente). */
  cardSize: Record<string, AjusteCard>;
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
      // Versão anterior guardava uma quantidade só (do modelo "De Olho nas Ofertas").
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
/** Fica true depois que os botões de cards existem (save() é chamado desde o início). */
let acoesCardsProntas = false;
const save = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* sem espaço: segue sem salvar */
  }
  // A cada alteração, um card pode deixar de estar (ou voltar a ficar) vazio.
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

/** Menor quantidade de cards (modelos com grupos fixos precisam de pelo menos esses + 1). */
const minimoCards = (t: PhotoTemplate) =>
  t.kind === 'grade' ? t.grupos.reduce((s, g) => s + (g.max > g.padrao ? 1 : g.padrao), 0) : 1;

/** Quantos produtos o modelo atual usa (nos modelos flexíveis, o que o usuário escolheu, por modelo). */
const quantidade = (t = template()) =>
  aceitaCards(t)
    ? Math.min(Math.max(minimoCards(t), state.cardCounts[t.id] ?? slotCount(t)), maxSlots(t))
    : slotCount(t);

const definirQuantidade = (t: PhotoTemplate, n: number) => {
  state.cardCounts[t.id] = n;
};

/** Garante que existam produtos suficientes no estado para a quantidade atual. */
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

/** Desenha a prévia; com `waitForPhotos` espera todas as fotos (usado antes do download). */
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
    // As fotos salvas já vêm no fundo escolhido. O recorte simples de fundo claro só é usado
    // quando a remoção de fundo da IA falhou e o usuário pediu "sem fundo".
    removeBg: !!p.photo?.startsWith('data:') && p.photoSource === SEM_IA && p.fundo === 'transparente',
    cardColor: state.squareMode === 'todos' ? state.squareColor : p.cardColor,
  }));
  const tmp = document.createElement('canvas');
  const { pending, tamanhoNome, ganhoCard, ganhoPreco } = await renderPhotoTemplate(tmp, t, data, {
      validity: state.validity,
      validade: { inicio: state.validityStart, fim: state.validity, estoque: state.untilStock },
      nome: tamanhoNomeAtual(t),
      card: ajusteCardAtual(t),
    }, waitForPhotos);
  if (ticket !== renderTicket) return;
  mostrarTamanhoNome(t, tamanhoNome);
  mostrarAjusteCard(t, ganhoCard, ganhoPreco);
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
    // O novo modelo pode usar mais produtos que os existentes.
    const antes = state.products.length;
    garantirProdutos();
    save();
    if (state.products.length !== antes) montarProdutos();
    syncTemplateUI();
    syncTamanhoNomeUI();
    syncAjusteCardUI();
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
/** Último tamanho de nome desenhado (px), para começar o "Personalizado" a partir dele. */
let ultimoTamanhoNome = 0;

/** Limite do controle em px: proporcional ao tamanho da arte (cada modelo tem uma resolução). */
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
    // Personalizado começa no tamanho que está aparecendo agora.
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
// Tamanho dos cards (esticar em largura/altura para ocupar o espaço livre)
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
  // Preço acompanha o card por padrão (também para escolhas salvas antes desta opção existir).
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
  tamCardPrecoBox.hidden = a.modo === 'padrao';
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
  const preco = pct(ganhoPreco) > 0
    ? ` Preço ${pct(ganhoPreco)}% maior.`
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
/** Foto usada sem a remoção de fundo da IA (falhou): no "sem fundo", aplica o recorte simples de fundo claro. */
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

  // Cor do quadrado deste produto (usada no modo "Escolher em cada produto").
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

/** Procura a foto salva do produto (pelo código de barras ou pelo nome), com os botões bloqueados. */
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

/**
 * Envio do usuário: o fundo é tirado no navegador e a foto é salva no banco (Supabase) como
 * foto do produto. Se o banco estiver fora do ar, a foto recortada é usada só neste encarte.
 */
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
const cardsInfo = $('cardsInfo');

/** Card sem nenhum cadastro iniciado (nome, preço, código de barras e foto vazios). */
const cardVazio = (p: ProductState) => !p.name.trim() && !p.price.trim() && !p.ean.trim() && !p.photo;

/**
 * Faixa de índices dos cards que podem ser adicionados/removidos.
 * Nos modelos com grupos fixos (ex.: "Super oferta"), só o grupo flexível muda.
 */
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

/** Índices dos cards vazios entre os que podem ser removidos. */
const indicesVazios = () => {
  const { inicio, fim } = faixaFlexivel();
  return state.products.slice(0, quantidade()).flatMap((p, i) => (i >= inicio && i < fim && cardVazio(p) ? [i] : []));
};

/** Habilita/desabilita "Adicionar card" e "Remover card vazio" conforme o encarte atual. */
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
}
acoesCardsProntas = true;

removerVazioBtn.addEventListener('click', () => {
  const t = template();
  const vazios = indicesVazios();
  if (!aceitaCards(t) || quantidade(t) <= minimoCards(t) || !vazios.length) return;
  // Remove um card vazio (o último deles); nunca mexe em cards com dados.
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
    // Insere no fim do grupo flexível (os grupos fixos, depois dele, não se movem).
    posicao = faixaFlexivel(t).fim;
    state.products.splice(posicao, 0, novoProduto());
    definirQuantidade(t, quantidade(t) + 1);
    novo = true;
  } else {
    definirQuantidade(t, quantidade(t) + 1);
    posicao = quantidade(t) - 1;
    // Reaproveita um produto que já existia nessa posição (se houver); senão cria um vazio.
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
  // Validade: nos modelos que têm datas escritas na arte (ou validade nos cards).
  validityField.hidden = !t.hasValidity && !temDatas(t.id);

  // Adicionar/remover cards só nos modelos com espaço flexível.
  const flex = aceitaCards(t);
  cardsAcoes.hidden = !flex;
  atualizarAcoesCards();
  cardsInfo.textContent = flex ? `${n} ${n === 1 ? 'card' : 'cards'} no encarte (máximo ${maxSlots(t)}).` : '';
  const { inicio, fim } = faixaFlexivel(t);
  blocks.forEach((b, i) => {
    b.querySelector<HTMLElement>('[data-act="remove-card"]')!.hidden = !flex || n <= minimoCards(t) || i < inicio || i >= fim;
  });
  // Títulos dos produtos (ex.: "Super oferta 1" nos grupos com nome).
  const titulos = titulosProdutos(t, n, distribuirGrupos);
  blocks.forEach((b, i) => (b.querySelector<HTMLElement>('.product__title')!.textContent = titulos[i] ?? `Produto ${i + 1}`));
  // A cor do card existe em todos os modelos (nos que não têm caixa, ela cria um card atrás do produto).
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
