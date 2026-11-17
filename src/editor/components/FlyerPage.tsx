import type { CSSProperties, Ref } from 'react';
import { guessEmoji } from '../emoji';
import { fontStack } from '../fonts';
import type { FormatDef } from '../formats';
import { GAP_M, type PageLayout } from '../layout';
import { formatNumberBR, splitPrice } from '../parser';
import type { Theme } from '../themes';
import type { Product, Settings } from '../types';

const TEXT_MULT = { lg: 1.15, md: 1, sm: 0.85 } as const;

export const formatDayMonth = (iso: string) => {
  const [, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : '';
};
const formatFull = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : '';
};

interface Props {
  layout: PageLayout;
  fmt: FormatDef;
  theme: Theme;
  settings: Settings;
  pageRef?: Ref<HTMLDivElement>;
  onProductClick?: (id: string) => void;
  onEmptyClick?: () => void;
}

export function FlyerPage({ layout, fmt, theme, settings: s, pageRef, onProductClick, onEmptyClick }: Props) {
  const m = Math.min(fmt.width, fmt.height) / 100;
  const widthM = fmt.width / m;

  const style = {
    width: fmt.width,
    height: fmt.height,
    '--m': `${m}px`,
    '--gap': `calc(var(--m) * ${GAP_M})`,
    '--primary': theme.primary,
    '--primary-dark': theme.primaryDark,
    '--secondary': theme.secondary,
    '--title-color': theme.titleColor,
    '--title-shadow': theme.titleShadow,
    '--bg': theme.bg,
    '--dot': theme.dot,
    '--card-bg': theme.cardBg,
    '--name-color': theme.nameColor,
    '--price-bg': theme.priceBg,
    '--price-text': theme.priceText,
    '--old-color': theme.oldColor,
    '--footer-bg': theme.footerBg,
    '--footer-text': theme.footerText,
    '--font-title': fontStack(s.fonts.title),
    '--font-price': fontStack(s.fonts.price),
    '--font-name': fontStack(s.fonts.name),
    '--text-mult': TEXT_MULT[s.textSize],
  } as CSSProperties;

  // Ajusta o título ao espaço livre entre logo e selo de datas.
  const reserved = (s.logo ? s.logoSize * 1.8 + 4 : 4) + (s.showDates ? 22 : 4) + 6;
  const titleLen = Math.max(4, s.title.length);
  const titleSize = Math.max(4, Math.min(12, (widthM - reserved) / (titleLen * 0.56)));

  const cellStyle: CSSProperties = {
    width: `calc((100% - ${layout.cols - 1} * var(--gap)) / ${layout.cols})`,
    height: `calc((100% - ${layout.rows - 1} * var(--gap)) / ${layout.rows})`,
  };

  return (
    <div className="fl-page" style={style} ref={pageRef}>
      <header className="fl-header">
        {s.logo && (
          <div className="fl-logo" style={{ height: `calc(var(--m) * ${s.logoSize})` }}>
            <img src={s.logo} alt="" />
          </div>
        )}
        <div className="fl-title">
          <h1 style={{ fontSize: `calc(var(--m) * ${titleSize.toFixed(2)})` }}>{s.title}</h1>
          {s.subtitle && <span className="fl-subtitle">{s.subtitle}</span>}
        </div>
        {s.showDates && <DateSeal from={s.validFrom} to={s.validTo} />}
      </header>

      <div className="fl-body">
        <div className="fl-grid">
          {layout.items.length === 0 ? (
            <button type="button" className="fl-empty" onClick={onEmptyClick}>
              <span className="fl-empty__plus">+</span>
              <span>ADICIONE SEUS PRODUTOS</span>
            </button>
          ) : (
            layout.items.map((p) => (
              <ProductCard key={p.id} product={p} wide={layout.wide} style={cellStyle} onClick={() => onProductClick?.(p.id)} />
            ))
          )}
        </div>
      </div>

      <Footer settings={s} />
    </div>
  );
}

function DateSeal({ from, to }: { from: string; to: string }) {
  const f = formatDayMonth(from);
  const t = formatDayMonth(to);
  if (!t) return null;
  return (
    <div className="fl-dates">
      {f ? (
        <>
          <span>De</span>
          <strong>{f}</strong>
          <span>até</span>
          <strong>{t}</strong>
        </>
      ) : (
        <>
          <span>Válido até</span>
          <strong>{t}</strong>
        </>
      )}
    </div>
  );
}

function ProductCard({ product: p, wide, style, onClick }: { product: Product; wide: boolean; style: CSSProperties; onClick: () => void }) {
  return (
    <div className={`fl-card${wide ? ' is-wide' : ''}`} style={style} onClick={onClick} title="Clique para editar">
      <div className="fl-card__img">
        {p.image ? <img src={p.image} alt="" /> : <span className="fl-card__emoji">{guessEmoji(p.name)}</span>}
      </div>
      <div className="fl-card__info">
        <div className="fl-card__name">{p.name}</div>
        <PriceTag price={p.price} oldPrice={p.oldPrice} unit={p.unit} />
      </div>
    </div>
  );
}

function PriceTag({ price, oldPrice, unit }: { price: number | null; oldPrice: number | null; unit: string }) {
  if (price == null) {
    return (
      <div className="fl-price fl-price--ask">
        <span className="fl-price__dec">CONSULTE</span>
      </div>
    );
  }
  const { int, cents } = splitPrice(price);
  return (
    <div className="fl-price-wrap">
      {oldPrice != null && <div className="fl-old">de R$ {formatNumberBR(oldPrice)}</div>}
      <div className="fl-price">
        <span className="fl-price__cur">R$</span>
        <span className="fl-price__int">{int}</span>
        <span className="fl-price__side">
          <span className="fl-price__dec">,{cents}</span>
          {unit && <span className="fl-price__unit">{unit}</span>}
        </span>
      </div>
    </div>
  );
}

function Footer({ settings: s }: { settings: Settings }) {
  const c = s.company;
  const validity = [
    s.validTo
      ? s.validFrom
        ? `Ofertas válidas de ${formatDayMonth(s.validFrom)} a ${formatFull(s.validTo)}`
        : `Ofertas válidas até ${formatFull(s.validTo)}`
      : 'Ofertas por tempo limitado',
    s.untilStock ? 'ou enquanto durarem os estoques' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const legal = [validity + '.', c.note].filter(Boolean).join(' ');
  const insta = c.instagram.replace(/^@/, '');

  const infos = (
    <>
      {c.phone && <span>☎ {c.phone}</span>}
      {c.whatsapp && <span>WhatsApp {c.whatsapp}</span>}
      {c.address && <span>📍 {c.address}</span>}
      {insta && <span>@{insta}</span>}
    </>
  );

  if (s.footer === 'compacto') {
    return (
      <footer className="fl-footer fl-footer--compacto">
        <div className="fl-footer__bar">
          {c.name && <strong>{c.name}</strong>}
          {infos}
          <em>{legal} *Imagens meramente ilustrativas.</em>
        </div>
      </footer>
    );
  }

  return (
    <footer className={`fl-footer fl-footer--${s.footer}`}>
      <div className="fl-footer__bar">
        {c.name && <strong>{c.name}</strong>}
        {infos}
      </div>
      <div className="fl-footer__legal">
        <span>{legal}</span>
        <span>*Imagens meramente ilustrativas</span>
      </div>
    </footer>
  );
}
