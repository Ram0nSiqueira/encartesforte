import { eraseRect } from '../produto/render';
import type { Rect } from '../produto/template';
import { loadImage, peekPhoto, preparePhoto, type PreparedPhoto } from './cutout';
import { baseComLogo } from './logo';
import { baseComContatos } from './contatos';
import { baseComDatas, type Validade } from './datas';
import type { Circle, EstiloCelula, EstiloPreco, Forma, PhotoTemplate, RelRect, TemplateGrade, FormaRestaurar } from './templates';

export interface PhotoProductData {
  name: string;
  price: number | null;
  unit: string;
  photo?: string;
  removeBg: boolean;
  /** Cor do quadrado do produto (modelo de cartões). Vazio = cor original do modelo. */
  cardColor?: string;
}

export interface RenderOptions {
  validity: string; // yyyy-mm-dd
  /** Período das ofertas escrito na arte. */
  validade?: Validade;
}

const MONT = "'Montserrat', Arial, sans-serif";

export async function ensureFonts() {
  await Promise.all([
    ...[400, 500, 700, 800, 900].map((w) => document.fonts.load(`${w} 40px ${MONT}`)),
    document.fonts.load("400 40px 'Anton'").catch(() => null), // números de algumas etiquetas
  ]);
}

const baseCache = new Map<string, Promise<HTMLImageElement>>();
const loadBase = (src: string) => {
  if (!baseCache.has(src)) baseCache.set(src, loadImage(src));
  return baseCache.get(src)!;
};

const font = (ctx: CanvasRenderingContext2D, weight: number, size: number) => {
  ctx.font = `${weight} ${size}px ${MONT}`;
};

const splitPrice = (v: number) => {
  const [i, c] = v.toFixed(2).split('.');
  return { int: Number(i).toLocaleString('pt-BR'), cents: c };
};

function sampleColor(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const d = ctx.getImageData(x - 2, y - 2, 5, 5).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
}

interface TextoAjustado {
  lines: string[];
  /** Linha de base (y) de cada linha. */
  ys: number[];
  size: number;
}

/**
 * Ajusta automaticamente um texto dentro de uma área: escolhe o MAIOR tamanho de fonte
 * (de maxSize até minSize) e o número de linhas (1..maxLines) em que tudo cabe.
 * `largura(y)` dá a largura disponível na altura y — permite áreas não retangulares (ex.: círculo).
 * Nunca deixa o texto sair da área: no último caso quebra palavras longas e encurta com "…".
 */
function ajustarTexto(
  ctx: CanvasRenderingContext2D, text: string, weight: number,
  opts: { maxSize: number; minSize: number; maxLines: number; top: number; bottom: number; largura: (y: number) => number; entrelinha?: number },
): TextoAjustado {
  const words = text.split(/\s+/).filter(Boolean);
  const entrelinha = opts.entrelinha ?? 1.08;
  const altura = opts.bottom - opts.top;

  /** Posições (linhas de base) de n linhas centralizadas verticalmente na área. */
  const posicoes = (n: number, size: number) => {
    const lh = size * entrelinha;
    const total = lh * (n - 1) + size * 0.75; // altura das maiúsculas na última linha
    const inicio = opts.top + (altura - total) / 2 + size * 0.75;
    return Array.from({ length: n }, (_, k) => inicio + k * lh);
  };
  const cabeAltura = (n: number, size: number) => size * entrelinha * (n - 1) + size * 0.8 <= altura + 0.5;
  /** Largura útil de uma linha: o ponto mais estreito entre o topo das letras e a base. */
  const larguraLinha = (base: number, size: number) => Math.min(opts.largura(base - size * 0.78), opts.largura(base + size * 0.05));

  /** Distribui as palavras em n linhas, respeitando a largura de cada linha. */
  const distribuir = (n: number, ys: number[], size: number, quebrarPalavras: boolean): string[] | null => {
    const fila = [...words];
    const linhas: string[] = [];
    for (let k = 0; k < n && fila.length; k++) {
      const max = larguraLinha(ys[k], size);
      let linha = '';
      while (fila.length) {
        const tentativa = linha ? `${linha} ${fila[0]}` : fila[0];
        if (ctx.measureText(tentativa).width <= max) {
          linha = tentativa;
          fila.shift();
        } else if (!linha && quebrarPalavras) {
          // Palavra maior que a linha: quebra por letras.
          let corte = fila[0].length - 1;
          while (corte > 1 && ctx.measureText(fila[0].slice(0, corte) + '-').width > max) corte--;
          linha = fila[0].slice(0, corte) + '-';
          fila[0] = fila[0].slice(corte);
          break;
        } else {
          break;
        }
      }
      if (!linha) return null;
      linhas.push(linha);
    }
    return fila.length ? null : linhas;
  };

  for (const quebrar of [false, true]) {
    for (let size = opts.maxSize; size >= opts.minSize; size -= 0.5) {
      font(ctx, weight, size);
      for (let n = 1; n <= opts.maxLines; n++) {
        if (!cabeAltura(n, size)) break;
        const ys = posicoes(n, size);
        const linhas = distribuir(n, ys, size, quebrar);
        if (linhas) return { lines: linhas, ys: posicoes(linhas.length, size), size };
      }
    }
  }

  // Último caso: tamanho mínimo, linhas máximas, e o resto encurtado com "…".
  const size = opts.minSize;
  font(ctx, weight, size);
  let n = opts.maxLines;
  while (n > 1 && !cabeAltura(n, size)) n--;
  const ys = posicoes(n, size);
  const fila = [...words];
  const linhas: string[] = [];
  for (let k = 0; k < n; k++) {
    const max = larguraLinha(ys[k], size);
    let linha = '';
    while (fila.length && ctx.measureText(linha ? `${linha} ${fila[0]}` : fila[0]).width <= max) {
      linha = linha ? `${linha} ${fila.shift()}` : fila.shift()!;
    }
    if (k === n - 1 && fila.length) {
      linha = [linha, ...fila].filter(Boolean).join(' ');
      while (linha.length > 1 && ctx.measureText(linha + '…').width > max) linha = linha.slice(0, -1);
      linha = linha.trimEnd() + '…';
      fila.length = 0;
    }
    linhas.push(linha);
  }
  return { lines: linhas, ys, size };
}

/** Desenha a foto: recortes soltos com sombra; fotos comuns numa moldura arredondada. */
function drawPhoto(
  ctx: CanvasRenderingContext2D, photo: PreparedPhoto, box: Rect,
  opts: { frameRadius: number; frameBorder: string; align: 'bottom' | 'center' },
) {
  const { canvas: img, cutout } = photo;
  if (cutout) {
    const k = Math.min(box.w / img.width, box.h / img.height);
    const w = img.width * k, h = img.height * k;
    const x = box.x + (box.w - w) / 2;
    const y = opts.align === 'bottom' ? box.y + box.h - h : box.y + (box.h - h) / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    return;
  }
  // Foto com fundo (branco ou original): inteira (sem cortes), centralizada, com cantos arredondados.
  const k = Math.min(box.w / img.width, box.h / img.height);
  const w = img.width * k, h = img.height * k;
  const x = box.x + (box.w - w) / 2, y = box.y + (box.h - h) / 2;
  const r = Math.min(opts.frameRadius, w / 2, h / 2);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = opts.frameBorder;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

/**
 * Usa as fotos já prontas e devolve as que ainda estão carregando.
 * Com `wait`, espera todas (usado no download).
 */
async function loadPhotos(products: PhotoProductData[], wait: boolean) {
  const pending: Promise<unknown>[] = [];
  const photos = await Promise.all(
    products.map(async (p) => {
      if (!p.photo) return null;
      const now = peekPhoto(p.photo, p.removeBg);
      if (now) return now;
      const promise = preparePhoto(p.photo, p.removeBg);
      if (!wait) {
        pending.push(promise.catch(() => null));
        return null;
      }
      try {
        return await promise;
      } catch {
        return null;
      }
    }),
  );
  return { photos, pending };
}

// ---------------------------------------------------------------------------
// Modelo "cartões" (De Olho nas Ofertas)
// ---------------------------------------------------------------------------
type TemplateCartoes = Extract<PhotoTemplate, { kind: 'cartoes' }>;

export interface LayoutCartoes {
  cards: Rect[];
  /** Escala dos cards em relação ao card original (1 = mesmo tamanho). */
  k: number;
  /** Remontar a arte (topo encolhido + cards + rodapé)? false = usar a imagem original como está. */
  remontar: boolean;
  topo?: { escala: number; destino: Rect };
  rodape?: { destino: Rect };
}

/**
 * Layout inteligente para N cards, todos iguais:
 * testa de 1 a N colunas e escolhe a que deixa os cards MAIORES, respeitando
 * a largura disponível e a menor escala aceitável do topo. O topo só encolhe o necessário.
 */
export function layoutCartoes(t: TemplateCartoes, n: number): LayoutCartoes {
  const base = t.cards[0];
  if (!t.flex || n === t.cards.length) {
    return { cards: t.cards.slice(0, n), k: 1, remontar: false };
  }
  const f = t.flex;
  const topoH = f.topo.y1 - f.topo.y0;
  const rodapeH = f.rodape.y1 - f.rodape.y0;
  const folgaTopo = t.cards[0].y - f.topo.y1; // espaço original entre topo e cards
  const folgaRodape = f.rodape.y0 - (base.y + base.h); // espaço original entre cards e rodapé
  const alturaLivre = t.height - rodapeH - folgaRodape - folgaTopo; // topo + cards
  const proporcao = base.h / base.w;

  // Pontuação: cards maiores são melhores, mas encolher o topo tem um custo
  // (só vale a pena quando o ganho no tamanho dos cards é grande).
  let melhor = { cols: 1, linhas: n, w: 0, pontos: -1 };
  for (let cols = 1; cols <= n; cols++) {
    const linhas = Math.ceil(n / cols);
    const wPorLargura = (f.area.w - (cols - 1) * f.gap) / cols;
    // 1) Poucos produtos: os cards CRESCEM (até ESCALA_MAX_CARD); para isso o topo pode
    //    ceder um pouco (no máximo até 80%), continuando bem legível.
    const alturaParaCrescer = alturaLivre - topoH * 0.8;
    const wCrescer = Math.min(
      base.w * ESCALA_MAX_CARD, wPorLargura,
      ((alturaParaCrescer - (linhas - 1) * f.gap) / linhas) / proporcao,
    );
    // 2) Se nem o tamanho original cabe, encolhe o topo (até o mínimo) e os cards diminuem.
    const alturaCards = alturaLivre - topoH * f.escalaMinTopo;
    const wPorAltura = ((alturaCards - (linhas - 1) * f.gap) / linhas) / proporcao;
    const w = wCrescer >= base.w ? wCrescer : Math.min(base.w, wPorLargura, wPorAltura);
    const altura = linhas * w * proporcao + (linhas - 1) * f.gap;
    const escalaTopo = Math.min(1, (alturaLivre - altura) / topoH);
    const pontos = w * (1 + 0.25 * escalaTopo);
    if (pontos > melhor.pontos + 0.5) melhor = { cols, linhas, w, pontos };
  }

  const w = melhor.w;
  const h = w * proporcao;
  const alturaCards = melhor.linhas * h + (melhor.linhas - 1) * f.gap;
  const escala = Math.min(1, (alturaLivre - alturaCards) / topoH);
  const topoAltura = topoH * escala;
  const topoLargura = t.width * escala;

  // Sobra de altura (quando o topo não precisa encolher): centraliza os cards no espaço livre.
  const inicioCards = topoAltura + folgaTopo;
  const fimCards = t.height - rodapeH - folgaRodape;
  const yCards = inicioCards + (fimCards - inicioCards - alturaCards) / 2;

  const cards: Rect[] = [];
  for (let i = 0; i < n; i++) {
    const linha = Math.floor(i / melhor.cols);
    const naLinha = Math.min(melhor.cols, n - linha * melhor.cols); // última linha pode ter menos
    const larguraLinha = naLinha * w + (naLinha - 1) * f.gap;
    const x0 = f.area.x + (f.area.w - larguraLinha) / 2;
    const col = i - linha * melhor.cols;
    cards.push({ x: x0 + col * (w + f.gap), y: yCards + linha * (h + f.gap), w, h });
  }

  return {
    cards,
    k: w / base.w,
    remontar: true,
    topo: { escala, destino: { x: (t.width - topoLargura) / 2, y: 0, w: topoLargura, h: topoAltura } },
    rodape: { destino: { x: 0, y: t.height - rodapeH, w: t.width, h: rodapeH } },
  };
}

/** Desenha um pedaço da imagem com as bordas esmaecidas (sem "costura" visível no fundo). */
function desenharFaixa(
  ctx: CanvasRenderingContext2D, img: CanvasImageSource, src: Rect, dst: Rect,
  esmaecer: { cima?: number; baixo?: number; lados?: number },
) {
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.round(dst.w));
  off.height = Math.max(1, Math.round(dst.h));
  const o = off.getContext('2d')!;
  o.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, off.width, off.height);
  o.globalCompositeOperation = 'destination-in';
  const aplicar = (g: CanvasGradient) => {
    o.fillStyle = g;
    o.fillRect(0, 0, off.width, off.height);
  };
  const W = off.width, H = off.height;
  if (esmaecer.lados) {
    const e = Math.min(esmaecer.lados / W, 0.45);
    const g = o.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(e, '#000'); g.addColorStop(1 - e, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
    aplicar(g);
  }
  if (esmaecer.cima || esmaecer.baixo) {
    const g = o.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, esmaecer.cima ? 'rgba(0,0,0,0)' : '#000');
    if (esmaecer.cima) g.addColorStop(Math.min(esmaecer.cima / H, 0.45), '#000');
    if (esmaecer.baixo) g.addColorStop(1 - Math.min(esmaecer.baixo / H, 0.45), '#000');
    g.addColorStop(1, esmaecer.baixo ? 'rgba(0,0,0,0)' : '#000');
    aplicar(g);
  }
  ctx.drawImage(off, dst.x, dst.y, dst.w, dst.h);
}

const topoRecortadoCache = new Map<string, { canvas: HTMLCanvasElement; corPainel: string }>();

/**
 * Prepara o conteúdo do topo para ser colocado sobre um painel mais largo:
 * deixa transparentes os pixels que são só "fundo da página" ou "fundo do painel"
 * (fora do painel e na faixa da borda dele), mantendo título, pessoa, moedas etc.
 */
function topoRecortado(base: HTMLImageElement | HTMLCanvasElement, t: TemplateCartoes) {
  const chave = t.src;
  const pronto = topoRecortadoCache.get(chave);
  if (pronto) return pronto;
  const f = t.flex!;
  const P = f.painel;
  const W = t.width, H = f.topo.y1 - f.topo.y0;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(base, 0, f.topo.y0, W, H, 0, 0, W, H);
  const img = x.getImageData(0, 0, W, H);
  const d = img.data;
  const cor = (px: number, py: number) => {
    const i = (Math.round(py) * W + Math.round(px)) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  };
  const pagina = cor(15, Math.min(H - 2, P.y + P.h / 2));
  const painel = cor(P.amostra.x, P.amostra.y - f.topo.y0);
  const dist = (r: number, g: number, b: number, ref: number[]) =>
    Math.hypot(r - ref[0], g - ref[1], b - ref[2]);
  const borda = 14; // faixa junto à borda do painel que também é limpa
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const yAbs = py + f.topo.y0;
      const dentro =
        px > P.x + borda && px < P.x + P.w - borda && yAbs > P.y + borda && yAbs < P.y + P.h - borda;
      if (dentro) continue;
      const i = (py * W + px) * 4;
      const dd = Math.min(dist(d[i], d[i + 1], d[i + 2], pagina), dist(d[i], d[i + 1], d[i + 2], painel));
      // Perto da cor de fundo = transparente; transição suave até 50 de distância.
      if (dd < 50) d[i + 3] = Math.round(d[i + 3] * Math.max(0, (dd - 22) / 28));
    }
  }
  x.putImageData(img, 0, 0);
  const resultado = { canvas: c, corPainel: `rgb(${painel.join(',')})` };
  topoRecortadoCache.set(chave, resultado);
  return resultado;
}

/**
 * Remonta a arte para o novo layout: fundo (cores amostradas da margem da imagem original),
 * topo (encolhido sobre um painel na largura toda), rodapé inteiro embaixo.
 * Os cards são desenhados depois.
 */
function remontarFundo(ctx: CanvasRenderingContext2D, base: HTMLImageElement | HTMLCanvasElement, t: TemplateCartoes, lay: LayoutCartoes) {
  const f = t.flex!;
  // Fundo: degradê vertical com as cores da margem esquerda da arte original.
  const amostra = document.createElement('canvas');
  amostra.width = t.width;
  amostra.height = t.height;
  const a = amostra.getContext('2d', { willReadFrequently: true })!;
  a.drawImage(base, 0, 0, t.width, t.height);
  const g = ctx.createLinearGradient(0, 0, 0, t.height);
  for (const fr of [0, 0.25, 0.5, 0.75, 1]) {
    const y = Math.min(t.height - 3, Math.max(3, fr * t.height));
    g.addColorStop(fr, sampleColor(a, 14, y));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, t.width, t.height);

  const topoSrc = { x: 0, y: f.topo.y0, w: t.width, h: f.topo.y1 - f.topo.y0 };
  const s = lay.topo!.escala;
  if (s >= 0.999) {
    desenharFaixa(ctx, base, topoSrc, lay.topo!.destino, { baixo: 24 });
  } else {
    // Painel na largura toda (alinhado com os cards), na altura do topo reduzido…
    const P = f.painel;
    const { canvas: conteudo, corPainel } = topoRecortado(base, t);
    ctx.fillStyle = corPainel;
    ctx.beginPath();
    ctx.roundRect(P.x, (P.y - f.topo.y0) * s, P.w, P.h * s, P.raio * Math.max(s, 0.7));
    ctx.fill();
    // …e o conteúdo do topo (título, pessoa, moedas) centralizado sobre ele.
    const d = lay.topo!.destino;
    ctx.drawImage(conteudo, d.x, d.y, d.w, d.h);
  }
  const rodSrc = { x: 0, y: f.rodape.y0, w: t.width, h: f.rodape.y1 - f.rodape.y0 };
  desenharFaixa(ctx, base, rodSrc, lay.rodape!.destino, { cima: 14 });
}

function drawCards(
  ctx: CanvasRenderingContext2D, t: TemplateCartoes, lay: LayoutCartoes,
  cores: { topo: string; corpo: string },
  products: PhotoProductData[], photos: (PreparedPhoto | null)[], opts: RenderOptions,
) {
  const [y, m, d] = opts.validity.split('-');
  const validityText = d ? `oferta válida até dia ${d}.${m}.${y}` : '';
  const k = lay.k; // todas as medidas do card original são multiplicadas por k
  const topH = t.topHeight * k;
  const raio = t.radius * k;

  lay.cards.forEach((card, i) => {
    const p = products[i];
    const cx = card.x + card.w / 2;

    // Cartão limpo (cobre a foto e os textos originais).
    ctx.fillStyle = cores.corpo;
    ctx.beginPath();
    ctx.roundRect(card.x - 1, card.y - 1, card.w + 2, card.h + 2, raio);
    ctx.fill();
    ctx.fillStyle = p?.cardColor || cores.topo;
    ctx.beginPath();
    ctx.roundRect(card.x - 1, card.y - 1, card.w + 2, topH, raio);
    ctx.fill();

    if (!p) return;

    // Foto centralizada dentro do quadrado (com margem), seja recorte ou foto com fundo.
    const photo = photos[i];
    if (photo) {
      const pad = (photo.cutout ? 14 : 12) * k;
      drawPhoto(ctx, photo, { x: card.x + pad, y: card.y + pad, w: card.w - pad * 2, h: topH - pad * 2 }, {
        frameRadius: 16 * k, frameBorder: '#ffffff', align: 'center',
      });
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // Nome do produto: ajustado automaticamente entre a foto e o preço (até 3 linhas).
    const name = p.name.trim();
    if (name) {
      const t2 = ajustarTexto(ctx, name, 600, {
        maxSize: 18 * k, minSize: Math.max(7, 10 * k), maxLines: 3,
        top: card.y + topH + 6 * k, bottom: card.y + 328 * k,
        largura: () => card.w - 16 * k,
      });
      font(ctx, 600, t2.size);
      ctx.fillStyle = '#fff2f2';
      t2.lines.forEach((l, j) => ctx.fillText(l, cx, t2.ys[j]));
    }

    // Preço: "R$" + valor + unidade empilhada ("a" / "unid").
    if (p.price != null) {
      const { int, cents } = splitPrice(p.price);
      const value = `${int},${cents}`;
      const unit = p.unit.trim();
      let size = 34 * k;
      const esp = 6 * k, espU = 5 * k;
      const widths = () => {
        font(ctx, 800, size * 0.44); const wc = ctx.measureText('R$').width;
        font(ctx, 800, size); const wv = ctx.measureText(value).width;
        font(ctx, 700, size * 0.36); const wu = unit ? Math.max(ctx.measureText(unit).width, ctx.measureText('a').width) : 0;
        return { wc, wv, wu, total: wc + esp + wv + (unit ? espU + wu : 0) };
      };
      let w = widths();
      while (w.total > card.w - 16 * k && size > 10) { size -= 0.5; w = widths(); }
      const base = card.y + 358 * k;
      let x = cx - w.total / 2;
      ctx.textAlign = 'left';
      font(ctx, 800, size * 0.44); ctx.fillStyle = '#ffffff'; ctx.fillText('R$', x, base - size * 0.12); x += w.wc + esp;
      font(ctx, 800, size); ctx.fillStyle = t.priceColor; ctx.fillText(value, x, base); x += w.wv + espU;
      if (unit) {
        font(ctx, 700, size * 0.36); ctx.fillStyle = '#ffffff';
        ctx.fillText('a', x, base - size * 0.42);
        ctx.fillText(unit, x, base - size * 0.06);
      }
      ctx.textAlign = 'center';
    }

    if (validityText) {
      let tam = 9.5 * k;
      font(ctx, 400, tam);
      while (ctx.measureText(validityText).width > card.w - 10 * k && tam > 5) { tam -= 0.25; font(ctx, 400, tam); }
      ctx.fillStyle = '#ffffff';
      ctx.fillText(validityText, cx, card.y + 374 * k);
    }
  });
}

// ---------------------------------------------------------------------------
// Modelo "selos" (Oferta da Semana — açougue)
// ---------------------------------------------------------------------------
function drawBadge(ctx: CanvasRenderingContext2D, b: Circle, p: PhotoProductData, priceColor: string) {
  const { cx, cy, r } = b;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#2b2b2b';
  ctx.fill();
  ctx.restore();

  // Miolo com ranhuras horizontais.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#262626');
  g.addColorStop(1, '#0b0b0b');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1.5;
  for (let y = cy - r; y < cy + r; y += 4.5) {
    ctx.beginPath();
    ctx.moveTo(cx - r, y);
    ctx.lineTo(cx + r, y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Nome: ajustado automaticamente dentro da parte de cima do selo, respeitando o círculo
  // (as linhas mais perto da borda têm menos largura). Até 3 linhas.
  const name = p.name.trim().toUpperCase();
  if (name) {
    const raioUtil = r - 9; // dentro do anel
    const t2 = ajustarTexto(ctx, name, 800, {
      maxSize: r * 0.25, minSize: r * 0.11, maxLines: 3, entrelinha: 1.05,
      top: cy - r * 0.7, bottom: cy - r * 0.17,
      largura: (y) => {
        const dy = Math.abs(y - cy);
        return dy >= raioUtil ? 0 : 2 * Math.sqrt(raioUtil * raioUtil - dy * dy) * 0.9;
      },
    });
    font(ctx, 800, t2.size);
    ctx.fillStyle = '#ffffff';
    t2.lines.forEach((l, k) => ctx.fillText(l, cx, t2.ys[k]));
  }

  if (p.price != null) {
    const { int, cents } = splitPrice(p.price);
    const unit = p.unit.trim().toUpperCase();
    // Altura do preço limitada para não invadir a área do nome.
    let big = r * 1.0;
    const measure = () => {
      font(ctx, 700, r * 0.17); const wc = ctx.measureText('R$').width;
      font(ctx, 900, big); const wi = ctx.measureText(int).width;
      font(ctx, 900, big * 0.5); const wd = ctx.measureText(`,${cents}`).width;
      return { wc, wi, wd, total: wc + 4 + wi + wd };
    };
    let m = measure();
    while (m.total > r * 1.62 && big > r * 0.4) { big -= 1; m = measure(); }

    const base = cy + r * 0.62;
    let x = cx - m.total / 2;
    ctx.textAlign = 'left';
    font(ctx, 700, r * 0.17); ctx.fillStyle = '#ffffff'; ctx.fillText('R$', x, base - big * 0.22); x += m.wc + 4;
    ctx.letterSpacing = '-2px';
    font(ctx, 900, big); ctx.fillStyle = priceColor; ctx.fillText(int, x, base); x += m.wi;
    const capTop = base - big * 0.72;
    font(ctx, 900, big * 0.5); ctx.fillText(`,${cents}`, x, capTop + big * 0.5 * 0.72);
    ctx.letterSpacing = '0px';
    if (unit) {
      font(ctx, 800, r * 0.16); ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(unit, x + m.wd / 2, base);
    }
    ctx.textAlign = 'center';
  }
}

function drawBadges(
  ctx: CanvasRenderingContext2D, t: Extract<PhotoTemplate, { kind: 'selos' }>,
  products: PhotoProductData[], photos: (PreparedPhoto | null)[],
) {
  for (const r of t.erase) eraseRect(ctx, r);
  for (const item of t.items) {
    const photo = photos[item.index];
    const cor = products[item.index]?.cardColor;
    if (cor) {
      // Cor escolhida: card arredondado atrás da foto do produto.
      const r = item.image;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 5;
      ctx.beginPath();
      ctx.roundRect(r.x - 8, r.y - 8, r.w + 16, r.h + 16, 26);
      ctx.fillStyle = cor;
      ctx.fill();
      ctx.restore();
    }
    if (photo) drawPhoto(ctx, photo, item.image, { frameRadius: 26, frameBorder: cor || '#ffffff', align: 'center' });
  }
  for (const item of t.items) {
    const p = products[item.index];
    if (p) drawBadge(ctx, item.badge, p, t.priceColor);
  }
}

// ---------------------------------------------------------------------------
// Modelo genérico "grade de produtos"
// ---------------------------------------------------------------------------
type Grupo = TemplateGrade['grupos'][number];

/** Quantos produtos cada grupo recebe: os fixos ficam com o padrão; o flexível com o restante. */
export function distribuirGrupos(t: TemplateGrade, total: number): number[] {
  const fixos = t.grupos.map((g) => (g.max > g.padrao ? 0 : g.padrao));
  const somaFixos = fixos.reduce((a, b) => a + b, 0);
  const iFlex = t.grupos.findIndex((g) => g.max > g.padrao);
  if (iFlex < 0) return fixos;
  const g = t.grupos[iFlex];
  fixos[iFlex] = Math.min(g.max, Math.max(1, total - somaFixos));
  return fixos;
}

/** Quanto um card pode crescer em relação ao tamanho original do modelo (poucos produtos). */
export const ESCALA_MAX_CARD = 2.4;

/**
 * Layout inteligente de um grupo: testa de 1 a N colunas e escolhe a que deixa as células
 * MAIORES, mantendo a proporção. Com poucos produtos o card CRESCE (até ESCALA_MAX_CARD) e
 * ocupa o espaço; com muitos, diminui. Foto, nome e preço acompanham o card (tudo em escala k).
 */
function layoutGrupo(g: Grupo, n: number): { cells: Rect[]; k: number } {
  const { w: bw, h: bh } = g.estilo.base;
  let melhor = { cols: 1, linhas: n, w: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const linhas = Math.ceil(n / cols);
    const wLarg = (g.area.w - (cols - 1) * g.gapX) / cols;
    const hAlt = (g.area.h - (linhas - 1) * g.gapY) / linhas;
    const w = Math.min(bw * (g.escalaMax ?? ESCALA_MAX_CARD), wLarg, hAlt * (bw / bh));
    // Empate no tamanho: prefere menos linhas (ex.: 3 cards lado a lado em vez de 2 + 1).
    if (w > melhor.w + 0.5 || (Math.abs(w - melhor.w) <= 0.5 && linhas < melhor.linhas)) melhor = { cols, linhas, w };
  }
  const w = melhor.w, h = w * (bh / bw);
  const k = w / bw;
  // Espaços entre cards: diminuem com cards pequenos, mas não crescem além do original
  // (o tamanho escolhido já conta com o espaço original, então tudo cabe na área).
  const fg = Math.min(1, Math.max(k, 0.6));
  const gx = g.gapX * fg, gy = g.gapY * fg;
  const alturaTotal = melhor.linhas * h + (melhor.linhas - 1) * gy;
  const y0 = g.area.y + (g.area.h - alturaTotal) / 2;
  const cells: Rect[] = [];
  for (let i = 0; i < n; i++) {
    const linha = Math.floor(i / melhor.cols);
    const naLinha = Math.min(melhor.cols, n - linha * melhor.cols);
    const largura = naLinha * w + (naLinha - 1) * gx;
    const x0 = g.area.x + (g.area.w - largura) / 2;
    const col = i - linha * melhor.cols;
    cells.push({ x: x0 + col * (w + gx), y: y0 + linha * (h + gy), w, h });
  }
  return { cells, k };
}

const rel = (c: Rect, r: RelRect): Rect => ({ x: c.x + r.x * c.w, y: c.y + r.y * c.h, w: r.w * c.w, h: r.h * c.h });

function caminhoForma(ctx: CanvasRenderingContext2D, f: Forma) {
  ctx.beginPath();
  if (f.tipo === 'rect') ctx.rect(f.rect.x, f.rect.y, f.rect.w, f.rect.h);
  else if (f.tipo === 'circulo') ctx.arc(f.cx, f.cy, f.r, 0, Math.PI * 2);
  else {
    f.pontos.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
}

function caixaDaForma(f: Forma): Rect {
  if (f.tipo === 'rect') return f.rect;
  if (f.tipo === 'circulo') return { x: f.cx - f.r, y: f.cy - f.r, w: f.r * 2, h: f.r * 2 };
  const xs = f.pontos.map((p) => p[0]), ys = f.pontos.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

const cruza = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Copia de volta, da imagem original, as partes indicadas (decorações que devem aparecer).
 * Com `evitar`, uma decoração que ficaria por cima/embaixo de um card é omitida.
 */
function restaurar(
  ctx: CanvasRenderingContext2D, base: HTMLImageElement | HTMLCanvasElement, t: TemplateGrade,
  formas: FormaRestaurar[] | undefined, padrao: boolean, evitar: Rect[] = [],
) {
  for (const f of formas ?? []) {
    if ((f.quando === 'padrao' && !padrao) || (f.quando === 'outros' && padrao)) continue;
    const caixa = caixaDaForma(f);
    if (!f.manterSobCards && evitar.some((c) => cruza(c, caixa))) continue;
    if (f.tipo === 'circulo' && f.exceto?.length && f.esfumar) {
      // Recorte com borda esfumada (a decoração some suavemente onde ficava o card original).
      const c = caixaDaForma(f);
      const off = document.createElement('canvas');
      off.width = Math.ceil(c.w); off.height = Math.ceil(c.h);
      const o = off.getContext('2d')!;
      o.translate(-c.x, -c.y);
      o.drawImage(base, 0, 0, t.width, t.height);
      // Borda do círculo também esfumada.
      const rg = o.createRadialGradient(f.cx, f.cy, Math.max(0, f.r - f.esfumar * 1.5), f.cx, f.cy, f.r);
      rg.addColorStop(0, 'rgba(0,0,0,1)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      o.globalCompositeOperation = 'destination-in';
      o.fillStyle = rg;
      o.fillRect(c.x, c.y, c.w, c.h);
      o.globalCompositeOperation = 'destination-out';
      o.filter = `blur(${f.esfumar}px)`;
      o.fillStyle = '#000';
      for (const r of f.exceto) {
        const m = f.esfumar * 0.6;
        o.beginPath();
        o.roundRect(r.x - m, r.y - m, r.w + m * 2, r.h + m * 2, (r.raio ?? 0) + m);
        o.fill();
      }
      ctx.drawImage(off, c.x, c.y);
      continue;
    }
    ctx.save();
    caminhoForma(ctx, f);
    ctx.clip();
    if (f.tipo === 'circulo' && f.exceto?.length) {
      ctx.beginPath();
      ctx.rect(0, 0, t.width, t.height);
      for (const r of f.exceto) ctx.roundRect(r.x, r.y, r.w, r.h, r.raio ?? 0);
      ctx.clip('evenodd');
    }
    ctx.drawImage(base, 0, 0, t.width, t.height);
    ctx.restore();
  }
}

/** Etiqueta de preço genérica (retângulo, pílula ou elipse), no estilo do modelo. */
function desenharEtiqueta(ctx: CanvasRenderingContext2D, r: Rect, e: EstiloPreco, price: number, unit: string) {
  if (e.baseSombra) {
    // Faixa por baixo da etiqueta (efeito 3D).
    ctx.beginPath();
    ctx.roundRect(r.x, r.y + r.h * 0.07, r.w, r.h, (e.raio ?? 0.1) * r.h);
    ctx.fillStyle = e.baseSombra;
    ctx.fill();
  }
  ctx.save();
  if (e.sombra) {
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = r.h * 0.12;
    ctx.shadowOffsetY = r.h * 0.05;
  }
  ctx.beginPath();
  if (e.forma === 'elipse') ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
  else ctx.roundRect(r.x, r.y, r.w, r.h, e.forma === 'pilula' ? r.h / 2 : (e.raio ?? 0.1) * r.h);
  ctx.fillStyle = e.fundo;
  ctx.fill();
  ctx.restore();
  if (e.borda) {
    ctx.strokeStyle = e.borda;
    ctx.lineWidth = Math.max(1, r.h * 0.03);
    ctx.stroke();
  }

  const it = e.italico ? 'italic ' : '';
  const fonte = (peso: number, tam: number) => `${it}${peso} ${tam}px ${MONT}`;
  // Fonte dos números (ex.: 'Anton', condensada); padrão: Montserrat 900.
  const fonteNum = (tam: number) => (e.fonteNumero ? `${it}400 ${tam}px '${e.fonteNumero}', ${MONT}` : fonte(900, tam));
  const { int, cents } = splitPrice(price);
  const u = unit.trim();
  const textoUnidade = e.unidade === 'nenhuma' || !u ? '' : (e.formatoUnidade ?? '{U}').replace('{U}', u.toUpperCase()).replace('{u}', u);
  // Com círculo do "R$": o círculo ocupa a ponta esquerda e o valor fica no restante.
  // Círculo do "R$": com `circuloRaio` menor, fica pequeno e "pendurado" na ponta esquerda.
  const circulo = e.circuloMoeda ? r.h * (e.circuloRaio ?? 0.5) : 0;
  const cxCirculo = e.circuloRaio ? r.x + circulo * 0.15 : r.x + circulo;
  if (e.circuloMoeda) {
    ctx.beginPath();
    ctx.arc(cxCirculo, r.y + r.h / 2, circulo, 0, Math.PI * 2);
    ctx.fillStyle = e.circuloMoeda;
    ctx.fill();
  }
  // Bloco colorido na ponta esquerda, com o "R$" dentro.
  const bloco = e.blocoMoeda ? r.w * e.blocoMoeda.largura : e.circuloRaio ? circulo * 1.25 : circulo * 2;
  if (e.blocoMoeda) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, (e.raio ?? 0.1) * r.h);
    ctx.clip();
    ctx.fillStyle = e.blocoMoeda.cor;
    ctx.fillRect(r.x, r.y, bloco, r.h);
    let t = r.h * 0.3;
    ctx.font = fonte(900, t);
    while (ctx.measureText('R$').width > bloco * 0.78 && t > 5) { t -= 0.25; ctx.font = fonte(900, t); }
    ctx.fillStyle = e.corMoeda;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('R$', r.x + bloco / 2, r.y + r.h / 2 + t * 0.36);
    ctx.restore();
  }
  const comBloco = !!(e.circuloMoeda || e.blocoMoeda);
  const areaX = r.x + bloco;
  const areaW = r.w - bloco;
  // Largura útil (elipse/pílula têm menos espaço nas pontas).
  const util = comBloco
    ? areaW * 0.86
    : r.w * (e.forma === 'elipse' ? 0.72 : e.forma === 'pilula' ? 0.84 : 0.88);

  let big = r.h * e.tamanhoInteiro;
  const tc = e.centavosTamanho ?? 0.5;
  const medir = () => {
    ctx.font = fonte(800, big * (e.moedaTamanho ?? 0.5)); const wm = comBloco || e.semMoeda ? 0 : ctx.measureText('R$').width;
    ctx.font = fonteNum(big); const wi = ctx.measureText(int).width;
    ctx.font = fonteNum(big * tc); const wc = ctx.measureText(`,${cents}`).width;
    ctx.font = fonte(800, big * 0.32); const wu = e.unidade === 'sob-centavos' && textoUnidade ? ctx.measureText(textoUnidade).width : 0;
    const gap = comBloco || e.semMoeda ? 0 : big * (e.moedaTamanho ?? 0.5) * 0.2;
    return { wm, wi, wc, gap, total: wm + gap + wi + Math.max(wc, wu) };
  };
  let m = medir();
  while (m.total > util && big > 6) { big -= 0.5; m = medir(); }

  const base = r.y + r.h * e.linhaBase;
  let x = comBloco ? areaX + (areaW - m.total) / 2 : r.x + (r.w - m.total) / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (e.circuloMoeda) {
    // "R$" centralizado no círculo.
    let t = r.h * 0.34;
    ctx.font = fonte(800, t);
    while (ctx.measureText('R$').width > circulo * 1.5 && t > 5) { t -= 0.25; ctx.font = fonte(800, t); }
    ctx.fillStyle = e.corMoeda;
    ctx.textAlign = 'center';
    ctx.fillText('R$', cxCirculo, r.y + r.h / 2 + t * 0.36);
    ctx.textAlign = 'left';
  } else if (!e.semMoeda && !e.blocoMoeda) {
    ctx.font = fonte(800, big * (e.moedaTamanho ?? 0.5)); ctx.fillStyle = e.corMoeda; ctx.fillText('R$', x, base - big * (e.moedaSubir ?? 0.28)); x += m.wm + m.gap;
  }
  ctx.font = fonteNum(big); ctx.fillStyle = e.corInteiro; ctx.fillText(int, x, base); x += m.wi;
  const topoInt = base - big * 0.72;
  ctx.font = fonteNum(big * tc); ctx.fillStyle = e.corCentavos;
  // Centavos elevados (alinhados ao topo do número) ou na linha de base.
  ctx.fillText(`,${cents}`, x, e.centavosNaBase || tc >= 1 ? base : topoInt + big * tc * 0.72);
  if (e.unidade === 'sob-centavos' && textoUnidade) {
    ctx.font = fonte(800, big * 0.32); ctx.fillStyle = e.corUnidade;
    ctx.fillText(textoUnidade, x + big * 0.06, base);
  }

  ctx.textAlign = 'center';
  const cx = r.x + r.w / 2;
  if (e.rotulo) {
    let t = r.h * 0.14;
    ctx.font = fonte(700, t);
    while (ctx.measureText(e.rotulo.texto).width > util && t > 5) { t -= 0.25; ctx.font = fonte(700, t); }
    ctx.fillStyle = e.rotulo.cor;
    ctx.fillText(e.rotulo.texto, cx, r.y + r.h * 0.22);
  }
  if (e.unidade === 'abaixo' && textoUnidade) {
    let t = r.h * (e.tamanhoUnidade ?? 0.12);
    ctx.font = fonte(700, t);
    while (ctx.measureText(textoUnidade).width > util && t > 5) { t -= 0.25; ctx.font = fonte(700, t); }
    ctx.fillStyle = e.corUnidade;
    ctx.fillText(textoUnidade, cx, r.y + r.h * 0.9);
  }
}

/**
 * Plaquinha de madeira (tábua arredondada com veios e cordinhas nas pontas) atrás do nome.
 * Devolve a área interna onde o texto deve caber.
 */
function desenharPlaca(ctx: CanvasRenderingContext2D, r: Rect, c: { cor: string; escura: string; clara: string; corda: string }, k: number): Rect {
  const corda = Math.min(r.w * 0.05, 14 * k);
  const x = r.x + corda, w = r.w - corda * 2, y = r.y, h = r.h;
  ctx.save();
  // Cordinhas (atrás da tábua), duas de cada lado.
  ctx.strokeStyle = c.corda;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, h * 0.07);
  for (const fy of [0.32, 0.68]) {
    for (const [x0, x1] of [[r.x + corda * 0.2, x + corda * 0.9], [x + w - corda * 0.9, r.x + r.w - corda * 0.2]]) {
      ctx.beginPath();
      ctx.moveTo(x0, y + h * fy);
      ctx.lineTo(x1, y + h * fy);
      ctx.stroke();
    }
  }
  // Tábua.
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = h * 0.18;
  ctx.shadowOffsetY = h * 0.06;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h * 0.16);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, c.clara);
  g.addColorStop(0.18, c.cor);
  g.addColorStop(1, c.escura);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip();
  // Veios da madeira (sempre iguais para o mesmo tamanho).
  ctx.strokeStyle = 'rgba(30,35,5,0.35)';
  ctx.lineWidth = Math.max(0.6, h * 0.018);
  for (let j = 1; j <= 5; j++) {
    const yy = y + (h * j) / 6 + Math.sin(j * 2.3) * h * 0.03;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    for (let xx = 0; xx <= w; xx += w / 12) ctx.lineTo(x + xx, yy + Math.sin(xx / (w / 6) + j) * h * 0.02);
    ctx.stroke();
  }
  ctx.restore();
  // Borda clara em cima, como luz batendo na tábua.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, w - 2, h - 2, h * 0.16);
  ctx.strokeStyle = 'rgba(210,230,120,0.35)';
  ctx.lineWidth = Math.max(1, h * 0.03);
  ctx.stroke();
  ctx.restore();
  const pad = h * 0.18;
  return { x: x + pad, y: y + h * 0.08, w: w - pad * 2, h: h * 0.84 };
}

/** Altura da curva em x: pontos ligados com interpolação suave (cosseno). */
function alturaCurva(pts: [number, number][], x: number) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (x <= x1) {
      const u = (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * (1 - Math.cos(Math.PI * u)) / 2;
    }
  }
  return pts[pts.length - 1][1];
}

/**
 * Fundo com duas regiões separadas por uma curva: acima, a textura de um trecho limpo da
 * imagem original (espelhada para não ter emendas); abaixo, cor lisa. Bordas da área se
 * misturam com a imagem original.
 */
function limparCurva(
  ctx: CanvasRenderingContext2D, base: HTMLImageElement | HTMLCanvasElement, t: TemplateGrade,
  l: Extract<TemplateGrade['limpar'][number], { tipo: 'curva' }>,
) {
  const src = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  src.canvas.width = t.width;
  src.canvas.height = t.height;
  src.drawImage(base, 0, 0, t.width, t.height);
  const q = l.acima;
  const tex = src.getImageData(q.x, q.y, q.w, q.h).data;
  const r = l.rect;
  const area = ctx.getImageData(r.x, r.y, r.w, r.h);
  const fora = parseRgb(l.abaixo);
  const s = l.suavizar;
  const curva = Array.from({ length: r.w }, (_, x) => alturaCurva(l.curva, r.x + x));
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const X = r.x + x, Y = r.y + y;
      // Textura espelhada a cada repetição.
      const ox = X - q.x, oy = Y - q.y;
      const rx = ((ox % (2 * q.w)) + 2 * q.w) % (2 * q.w), ry = ((oy % (2 * q.h)) + 2 * q.h) % (2 * q.h);
      const tx = rx < q.w ? rx : 2 * q.w - 1 - rx, ty = ry < q.h ? ry : 2 * q.h - 1 - ry;
      const ti = (ty * q.w + tx) * 4;
      // Mistura acima/abaixo na curva (anti-serrilhado).
      const d = Y - curva[x];
      const wf = Math.min(1, Math.max(0, d / 1.5 + 0.5));
      // Mistura com a imagem original perto das bordas da área.
      const borda = Math.min(x, y, r.w - 1 - x, r.h - 1 - y);
      const wn = Math.min(1, borda / s);
      const i = (y * r.w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const novo = tex[ti + c] * (1 - wf) + fora[c] * wf;
        area.data[i + c] = area.data[i + c] * (1 - wn) + novo * wn;
      }
    }
  }
  ctx.putImageData(area, r.x, r.y);
}

function parseRgb(cor: string): [number, number, number] {
  const m = cor.match(/\d+(\.\d+)?/g)?.map(Number);
  if (cor.startsWith('#')) {
    const h = cor.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  return [m?.[0] ?? 0, m?.[1] ?? 0, m?.[2] ?? 0];
}

function desenharCelula(
  ctx: CanvasRenderingContext2D, cel: Rect, k: number, est: EstiloCelula,
  p: PhotoProductData | undefined, photo: PreparedPhoto | null,
) {
  if (est.caixa) {
    const c = rel(cel, est.caixa.rect);
    ctx.save();
    if (est.caixa.sombra) {
      ctx.shadowColor = 'rgba(0,0,0,0.28)';
      ctx.shadowBlur = 22 * k;
      ctx.shadowOffsetY = 8 * k;
    }
    ctx.beginPath();
    ctx.roundRect(c.x, c.y, c.w, c.h, est.caixa.raio * k);
    ctx.fillStyle = p?.cardColor || est.caixa.fundo;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    if (est.caixa.pontos) {
      ctx.fillStyle = est.caixa.pontos;
      for (let j = 0; j < 3; j++) {
        ctx.beginPath();
        ctx.arc(c.x + 30 * k + j * 12 * k, c.y + 22 * k, 4 * k, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (est.caixa.borda) {
      ctx.strokeStyle = est.caixa.borda;
      ctx.lineWidth = (est.caixa.larguraBorda ?? 2) * Math.max(k, 0.5);
      ctx.stroke();
    }
    ctx.restore();
  } else if (p?.cardColor) {
    // Modelo sem caixa: a cor escolhida vira um card arredondado atrás do produto.
    const pad = 6 * k;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 10 * k;
    ctx.shadowOffsetY = 3 * k;
    ctx.beginPath();
    ctx.roundRect(cel.x - pad, cel.y - pad, cel.w + pad * 2, cel.h + pad * 2, 16 * k);
    ctx.fillStyle = p.cardColor;
    ctx.fill();
    ctx.restore();
  }
  if (est.fundoFoto) {
    const ff = est.fundoFoto;
    const f = rel(cel, ff.rect);
    const rr = ff.raio * k;
    ctx.beginPath();
    ctx.roundRect(f.x, f.y, f.w, f.h, ff.cantos === 'topo' ? [rr, rr, 0, 0] : rr);
    if (ff.radial) {
      // Brilho no centro, escurecendo para as bordas.
      const g = ctx.createRadialGradient(f.x + f.w / 2, f.y + f.h * 0.45, 0, f.x + f.w / 2, f.y + f.h * 0.45, Math.max(f.w, f.h) * 0.62);
      g.addColorStop(0, ff.radial[0]);
      g.addColorStop(1, ff.radial[1]);
      ctx.fillStyle = g;
    } else ctx.fillStyle = ff.cor;
    ctx.fill();
  }
  if (!p) return;

  if (photo) {
    drawPhoto(ctx, photo, rel(cel, est.foto), { frameRadius: 14 * k, frameBorder: '#ffffff', align: 'center' });
  }
  if (est.selo) {
    // Selo (ex.: "BLACK") no canto do card.
    const sr = rel(cel, est.selo.rect);
    ctx.beginPath();
    ctx.roundRect(sr.x, sr.y, sr.w, sr.h, sr.h / 2);
    ctx.fillStyle = est.selo.fundo;
    ctx.fill();
    let t = sr.h * 0.5;
    ctx.font = `900 ${t}px ${MONT}`;
    ctx.letterSpacing = `${t * 0.08}px`;
    while (ctx.measureText(est.selo.texto).width > sr.w * 0.8 && t > 5) { t -= 0.25; ctx.font = `900 ${t}px ${MONT}`; ctx.letterSpacing = `${t * 0.08}px`; }
    ctx.fillStyle = est.selo.cor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(est.selo.texto, sr.x + sr.w / 2, sr.y + sr.h / 2 + t * 0.36);
    ctx.letterSpacing = '0px';
  }

  const nome = p.name.trim();
  if (nome) {
    const s = est.nome.estilo;
    let r = rel(cel, est.nome);
    if (s.placa) r = desenharPlaca(ctx, r, s.placa, k);
    const texto = (s.prefixo ?? '') + (s.maiusculas ? nome.toUpperCase() : nome);
    const peso = s.peso;
    const it = s.italico ? 'italic ' : '';
    // ajustarTexto usa a fonte padrão; o itálico é aplicado no desenho (mesma largura aproximada).
    const t2 = ajustarTexto(ctx, texto, peso, {
      maxSize: s.tamanhoMax * k, minSize: Math.max(6, s.tamanhoMin * k), maxLines: s.maxLinhas,
      top: r.y, bottom: r.y + r.h, largura: () => r.w,
    });
    ctx.save();
    ctx.font = `${it}${peso} ${t2.size}px ${MONT}`;
    ctx.fillStyle = s.cor;
    const esquerda = s.alinhar === 'esquerda';
    ctx.textAlign = esquerda ? 'left' : 'center';
    ctx.textBaseline = 'alphabetic';
    if (s.sombra) {
      ctx.shadowColor = s.sombra;
      ctx.shadowBlur = t2.size * 0.25;
      ctx.shadowOffsetY = t2.size * 0.08;
    }
    t2.lines.forEach((l, j) => ctx.fillText(l, esquerda ? r.x : r.x + r.w / 2, t2.ys[j]));
    ctx.restore();
  }

  if (p.price != null) desenharEtiqueta(ctx, rel(cel, est.preco), est.preco.estilo, p.price, p.unit);
}

/**
 * Refaz um fundo em degradê a partir de colunas de referência (lidas da imagem ORIGINAL).
 * Coluna sem `pontos`: amostrada em toda a altura (suavizada). Com `pontos`: só naquelas
 * alturas, interpolando entre elas. Entre colunas, interpolação suave (cosseno) + leve granulado.
 */
function limparPorColunas(
  ctx: CanvasRenderingContext2D, base: HTMLImageElement | HTMLCanvasElement, t: TemplateGrade,
  l: Extract<TemplateGrade['limpar'][number], { tipo: 'colunas' }>,
) {
  const { rect: r } = l;
  const src = document.createElement('canvas');
  src.width = t.width;
  src.height = t.height;
  const s = src.getContext('2d', { willReadFrequently: true })!;
  s.drawImage(base, 0, 0, t.width, t.height);

  const media = (x: number, y: number, raio: number) => {
    const x0 = Math.max(0, Math.round(x - raio)), y0 = Math.max(0, Math.round(y - raio));
    const w = Math.min(t.width - x0, raio * 2 + 1), h = Math.min(t.height - y0, raio * 2 + 1);
    const d = s.getImageData(x0, y0, w, h).data;
    let R = 0, G = 0, B = 0;
    for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
    const n = d.length / 4;
    return [R / n, G / n, B / n];
  };

  // Cor de cada coluna, linha a linha.
  const perfis = l.colunas.map((c) => {
    const perfil: number[][] = [];
    if (!c.pontos) {
      const bruto: number[][] = [];
      for (let y = 0; y < r.h; y++) bruto.push(media(c.x, r.y + y, 2));
      const raio = 10; // suavização vertical
      for (let y = 0; y < r.h; y++) {
        const acc = [0, 0, 0];
        let n = 0;
        for (let k = -raio; k <= raio; k++) {
          const v = bruto[Math.min(r.h - 1, Math.max(0, y + k))];
          acc[0] += v[0]; acc[1] += v[1]; acc[2] += v[2]; n++;
        }
        perfil.push([acc[0] / n, acc[1] / n, acc[2] / n]);
      }
    } else {
      const amostras = c.pontos.map((py) => ({ y: py, cor: media(c.x, py, 3) }));
      for (let y = 0; y < r.h; y++) {
        const yy = r.y + y;
        let i = amostras.findIndex((a) => a.y >= yy);
        if (i <= 0) perfil.push(amostras[i === 0 ? 0 : amostras.length - 1].cor);
        else {
          const a = amostras[i - 1], b = amostras[i];
          const u = (yy - a.y) / (b.y - a.y);
          perfil.push([0, 1, 2].map((k) => a.cor[k] + (b.cor[k] - a.cor[k]) * u));
        }
      }
    }
    return { x: c.x, perfil };
  });

  // Linha da imagem logo acima da área (suavizada na horizontal), para a transição do topo.
  const mesclar = l.mesclarTopo ?? 0;
  let topo: number[][] = [];
  if (mesclar > 0 && r.y >= 4) {
    const bruto = Array.from({ length: r.w }, (_, x) => media(r.x + x, r.y - 3, 2));
    const raio = 36; // suavização horizontal forte: evita listras verticais na transição
    topo = bruto.map((_, x) => {
      const acc = [0, 0, 0];
      let n = 0;
      for (let k = -raio; k <= raio; k++) {
        const v = bruto[Math.min(r.w - 1, Math.max(0, x + k))];
        acc[0] += v[0]; acc[1] += v[1]; acc[2] += v[2]; n++;
      }
      return [acc[0] / n, acc[1] / n, acc[2] / n];
    });
  }

  // Textura: só o detalhe fino de um trecho limpo (pixel − média local), sem a iluminação do
  // trecho, para não criar faixas ao repetir.
  let tex: { det: Float32Array; w: number; h: number; k: number } | null = null;
  if (l.detalhe) {
    const q = l.detalhe.rect;
    const d = s.getImageData(q.x, q.y, q.w, q.h).data;
    const R = 10; // raio da média local
    const det = new Float32Array(q.w * q.h * 3);
    for (let c = 0; c < 3; c++) {
      // Imagem integral do canal para médias rápidas.
      const I = new Float64Array((q.w + 1) * (q.h + 1));
      for (let y = 0; y < q.h; y++) {
        let linha = 0;
        for (let x = 0; x < q.w; x++) {
          linha += d[(y * q.w + x) * 4 + c];
          I[(y + 1) * (q.w + 1) + x + 1] = I[y * (q.w + 1) + x + 1] + linha;
        }
      }
      for (let y = 0; y < q.h; y++) {
        const y0 = Math.max(0, y - R), y1 = Math.min(q.h, y + R + 1);
        for (let x = 0; x < q.w; x++) {
          const x0 = Math.max(0, x - R), x1 = Math.min(q.w, x + R + 1);
          const soma = I[y1 * (q.w + 1) + x1] - I[y0 * (q.w + 1) + x1] - I[y1 * (q.w + 1) + x0] + I[y0 * (q.w + 1) + x0];
          det[(y * q.w + x) * 3 + c] = d[(y * q.w + x) * 4 + c] - soma / ((x1 - x0) * (y1 - y0));
        }
      }
    }
    tex = { det, w: q.w, h: q.h, k: l.detalhe.intensidade };
  }

  const img = ctx.createImageData(r.w, r.h);
  for (let y = 0; y < r.h; y++) {
    // Peso da linha de cima: 1 no topo da área, caindo suavemente até 0 em `mesclar` px.
    const wTopo = topo.length && y < mesclar ? (1 + Math.cos((Math.PI * y) / mesclar)) / 2 : 0;
    for (let x = 0; x < r.w; x++) {
      const xx = r.x + x;
      let j = perfis.findIndex((p) => p.x >= xx);
      let cor: number[];
      if (j <= 0) cor = perfis[j === 0 ? 0 : perfis.length - 1].perfil[y];
      else {
        const a = perfis[j - 1], b = perfis[j];
        const u = (xx - a.x) / (b.x - a.x);
        const su = (1 - Math.cos(Math.PI * u)) / 2; // suave
        cor = [0, 1, 2].map((k) => a.perfil[y][k] + (b.perfil[y][k] - a.perfil[y][k]) * su);
      }
      if (wTopo > 0) cor = cor.map((v, k) => v * (1 - wTopo) + topo[x][k] * wTopo);
      if (tex) {
        // Espelha o trecho a cada repetição (sem emendas visíveis).
        const tx = Math.floor(x / tex.w) % 2 ? tex.w - 1 - (x % tex.w) : x % tex.w;
        const ty = Math.floor(y / tex.h) % 2 ? tex.h - 1 - (y % tex.h) : y % tex.h;
        const ti = (ty * tex.w + tx) * 3;
        cor = cor.map((v, k) => v + tex!.det[ti + k] * tex!.k);
      }
      const i = (y * r.w + x) * 4;
      const grain = (Math.random() - 0.5) * 3;
      img.data[i] = cor[0] + grain;
      img.data[i + 1] = cor[1] + grain;
      img.data[i + 2] = cor[2] + grain;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, r.x, r.y);
}

/** Redesenha uma forma do modelo: contornos (do mais largo ao mais fino) e interior. */
function desenharForma(
  ctx: CanvasRenderingContext2D, base: HTMLImageElement | HTMLCanvasElement, t: TemplateGrade,
  d: NonNullable<TemplateGrade['desenhos']>[number],
) {
  const linha = () => {
    ctx.beginPath();
    d.pontos.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  };
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  // Contorno mais largo (anel externo) primeiro; o interior cobre a metade de dentro dele.
  const [externo, ...internos] = d.contornos;
  if (externo) {
    linha();
    ctx.strokeStyle = externo.cor;
    ctx.lineWidth = externo.largura;
    ctx.stroke();
  }
  linha();
  ctx.closePath();
  if ('cor' in d.preenchimento) {
    ctx.fillStyle = d.preenchimento.cor;
  } else {
    // Textura: um pedaço da imagem ORIGINAL repetido (ex.: o pontilhado do selo).
    const r = d.preenchimento.textura;
    const tile = document.createElement('canvas');
    tile.width = r.w;
    tile.height = r.h;
    tile.getContext('2d')!.drawImage(base, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    ctx.fillStyle = ctx.createPattern(tile, 'repeat')!;
  }
  ctx.fill();
  for (const c of internos) {
    linha();
    ctx.strokeStyle = c.cor;
    ctx.lineWidth = c.largura;
    ctx.stroke();
  }
  ctx.restore();
  void t;
}

/**
 * Devolve a textura fina (ex.: pontinhos do fundo) a uma área apagada: soma o detalhe
 * (pixel − média do trecho) de um trecho limpo, repetido alinhado às coordenadas da imagem.
 * O trecho deve ter tamanho múltiplo do período do padrão.
 */
function somarTextura(ctx: CanvasRenderingContext2D, r: Rect, tile: ImageData, q: Rect) {
  const media = [0, 0, 0];
  for (let i = 0; i < tile.data.length; i += 4) for (let k = 0; k < 3; k++) media[k] += tile.data[i + k];
  for (let k = 0; k < 3; k++) media[k] /= tile.data.length / 4;
  const area = ctx.getImageData(r.x, r.y, r.w, r.h);
  // Some nas bordas para não marcar a emenda com a imagem original.
  const borda = 6;
  for (let y = 0; y < r.h; y++) {
    const ty = (((r.y + y - q.y) % q.h) + q.h) % q.h;
    for (let x = 0; x < r.w; x++) {
      const tx = (((r.x + x - q.x) % q.w) + q.w) % q.w;
      const ti = (ty * q.w + tx) * 4;
      const i = (y * r.w + x) * 4;
      const peso = Math.min(1, Math.min(x, y, r.w - 1 - x, r.h - 1 - y) / borda);
      for (let k = 0; k < 3; k++) area.data[i + k] += (tile.data[ti + k] - media[k]) * peso;
    }
  }
  ctx.putImageData(area, r.x, r.y);
}

function drawGrade(
  ctx: CanvasRenderingContext2D, base: HTMLImageElement | HTMLCanvasElement, t: TemplateGrade,
  products: PhotoProductData[], photos: (PreparedPhoto | null)[],
) {
  for (const l of t.limpar) {
    if (l.tipo === 'coons') {
      const tile = l.textura ? ctx.getImageData(l.textura.x, l.textura.y, l.textura.w, l.textura.h) : null;
      eraseRect(ctx, l.rect);
      if (tile && l.textura) somarTextura(ctx, l.rect, tile, l.textura);
    }
    else if (l.tipo === 'colunas') limparPorColunas(ctx, base, t, l);
    else if (l.tipo === 'curva') limparCurva(ctx, base, t, l);
    else {
      ctx.fillStyle = l.cor;
      ctx.beginPath();
      ctx.roundRect(l.rect.x, l.rect.y, l.rect.w, l.rect.h, l.raio);
      ctx.fill();
    }
  }
  for (const d of t.desenhos ?? []) desenharForma(ctx, base, t, d);

  const qtd = distribuirGrupos(t, products.length);
  const layouts = t.grupos.map((g, gi) => layoutGrupo(g, qtd[gi]));
  // Área ocupada por cada card (foto + nome + preço), para não sobrepor decorações.
  const ocupadas = layouts.flatMap((l, gi) =>
    l.cells.map((c) => {
      const e = t.grupos[gi].estilo;
      const partes = [rel(c, e.foto), rel(c, e.nome), rel(c, e.preco), ...(e.caixa ? [rel(c, e.caixa.rect)] : [])];
      const x0 = Math.min(...partes.map((p) => p.x)), y0 = Math.min(...partes.map((p) => p.y));
      const x1 = Math.max(...partes.map((p) => p.x + p.w)), y1 = Math.max(...partes.map((p) => p.y + p.h));
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }),
  );
  // Layout original da arte (mesma quantidade de cards): decorações exatamente como no original.
  const padrao = t.grupos.every((g, gi) => qtd[gi] === g.padrao);
  restaurar(ctx, base, t, t.restaurarAntes, padrao, ocupadas);

  let inicio = 0;
  t.grupos.forEach((g, gi) => {
    const { cells, k } = layouts[gi];
    cells.forEach((cel, j) => desenharCelula(ctx, cel, k, g.estilo, products[inicio + j], photos[inicio + j] ?? null));
    inicio += qtd[gi];
  });

  restaurar(ctx, base, t, t.restaurarDepois, padrao);
}

/**
 * Desenha o encarte. Devolve as fotos que ainda estavam carregando
 * (para a prévia redesenhar quando chegarem).
 */
export async function renderPhotoTemplate(
  canvas: HTMLCanvasElement, t: PhotoTemplate, products: PhotoProductData[], opts: RenderOptions,
  waitForPhotos = false,
): Promise<{ pending: Promise<unknown>[] }> {
  const [original, { photos, pending }] = await Promise.all([loadBase(t.src), loadPhotos(products, waitForPhotos)]);
  // Logo da empresa no lugar de "SEU LOGO" / nome do mercado escrito na arte.
  const comLogo0 = await baseComLogo(t.id, original, t.width, t.height);
  // Contatos certos do Forte no lugar dos dados de exemplo da arte.
  const comLogo = await baseComContatos(t.id, comLogo0, t.width, t.height);
  // Datas de validade escritas na arte.
  const base = await baseComDatas(t.id, comLogo, t.width, t.height, opts.validade);
  canvas.width = t.width;
  canvas.height = t.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(base, 0, 0, t.width, t.height);
  if (t.kind === 'cartoes') {
    // Cores do card amostradas da arte original (antes de remontar).
    const c0 = t.cards[0];
    const cores = {
      topo: sampleColor(ctx, c0.x + t.sampleTop.dx, c0.y + t.sampleTop.dy),
      corpo: sampleColor(ctx, c0.x + t.sampleBody.dx, c0.y + t.sampleBody.dy),
    };
    const lay = layoutCartoes(t, products.length);
    if (lay.remontar) remontarFundo(ctx, base, t, lay);
    drawCards(ctx, t, lay, cores, products, photos, opts);
  } else if (t.kind === 'grade') {
    drawGrade(ctx, base, t, products, photos);
  } else {
    drawBadges(ctx, t, products, photos);
  }
  return { pending };
}
