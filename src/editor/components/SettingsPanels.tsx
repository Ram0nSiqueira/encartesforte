import { fontStack, FONT_OPTIONS } from '../fonts';
import { fileToDataUrl, IMAGE_ACCEPT } from '../image';
import { getTheme, THEMES } from '../themes';
import type { Company, FontChoice, Settings } from '../types';

interface PanelProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

export function ThemesPanel({ settings: s, onChange }: PanelProps) {
  const select = (id: string) => {
    const current = getTheme(s.themeId);
    const next = getTheme(id);
    const patch: Partial<Settings> = { themeId: id };
    // Só troca os textos se o usuário ainda não personalizou.
    if (s.title === current.defaultTitle) patch.title = next.defaultTitle;
    if (s.subtitle === current.defaultSubtitle) patch.subtitle = next.defaultSubtitle;
    onChange(patch);
  };

  return (
    <div className="stack">
      <h3>Tema</h3>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`theme-swatch${t.id === s.themeId ? ' is-active' : ''}`}
            onClick={() => select(t.id)}
          >
            <span
              className="theme-swatch__top"
              style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.primaryDark})`, borderBottomColor: t.secondary }}
            >
              <b style={{ color: t.titleColor }}>{t.defaultTitle}</b>
            </span>
            <span className="theme-swatch__body" style={{ background: t.bg }}>
              <i style={{ background: t.priceBg }} />
              <i style={{ background: t.priceBg }} />
            </span>
            <span className="theme-swatch__name">{t.name}</span>
          </button>
        ))}
      </div>

      <h3>Textos do cabeçalho</h3>
      <label className="field">
        Título
        <input value={s.title} maxLength={28} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      <label className="field">
        Subtítulo (faixa acima do título)
        <input value={s.subtitle} maxLength={40} onChange={(e) => onChange({ subtitle: e.target.value })} />
      </label>
    </div>
  );
}

export function DatesPanel({ settings: s, onChange }: PanelProps) {
  return (
    <div className="stack">
      <h3>Validade das ofertas</h3>
      <label className="field">
        Início
        <input type="date" value={s.validFrom} onChange={(e) => onChange({ validFrom: e.target.value })} />
      </label>
      <label className="field">
        Fim
        <input type="date" value={s.validTo} onChange={(e) => onChange({ validTo: e.target.value })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={s.showDates} onChange={(e) => onChange({ showDates: e.target.checked })} />
        Mostrar selo de datas no cabeçalho
      </label>
      <label className="check">
        <input type="checkbox" checked={s.untilStock} onChange={(e) => onChange({ untilStock: e.target.checked })} />
        Incluir “ou enquanto durarem os estoques”
      </label>
    </div>
  );
}

export function LogoPanel({ settings: s, onChange }: PanelProps) {
  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      onChange({ logo: await fileToDataUrl(file, 700) });
    } catch {
      alert('Não foi possível ler esta imagem. Use PNG, JPG ou WEBP.');
    }
  };
  return (
    <div className="stack">
      <h3>Sua logo</h3>
      <p className="hint">Use preferencialmente PNG com fundo transparente.</p>
      <div className="logo-preview">
        {s.logo ? <img src={s.logo} alt="Logo" /> : <span>Nenhuma logo enviada</span>}
      </div>
      <label className="btn-primary btn-block file-btn">
        {s.logo ? 'Trocar logo' : 'Enviar logo'}
        <input type="file" accept={IMAGE_ACCEPT} hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {s.logo && (
        <>
          <label className="field">
            Tamanho da logo
            <input type="range" min={8} max={18} step={0.5} value={s.logoSize} onChange={(e) => onChange({ logoSize: Number(e.target.value) })} />
          </label>
          <button type="button" className="btn-link danger" onClick={() => onChange({ logo: undefined })}>
            Remover logo
          </button>
        </>
      )}
    </div>
  );
}

const COMPANY_FIELDS: [keyof Company, string, string][] = [
  ['name', 'Nome do supermercado', 'Ex.: Supermercado Forte'],
  ['phone', 'Telefone', '(11) 4000-0000'],
  ['whatsapp', 'WhatsApp', '(11) 90000-0000'],
  ['address', 'Endereço', 'Rua das Flores, 100 - Centro'],
  ['instagram', 'Instagram', '@seumercado'],
  ['note', 'Observação no rodapé', 'Ex.: Aceitamos todos os cartões'],
];

export function CompanyPanel({ settings: s, onChange }: PanelProps) {
  return (
    <div className="stack">
      <h3>Dados da empresa</h3>
      <p className="hint">Aparecem no rodapé do encarte. Deixe em branco o que não quiser mostrar.</p>
      {COMPANY_FIELDS.map(([key, label, ph]) => (
        <label className="field" key={key}>
          {label}
          <input
            value={s.company[key]}
            placeholder={ph}
            onChange={(e) => onChange({ company: { ...s.company, [key]: e.target.value } })}
          />
        </label>
      ))}
    </div>
  );
}

const FONT_ROLES: [keyof FontChoice, string, string][] = [
  ['title', 'Título do cabeçalho', 'OFERTAS'],
  ['price', 'Preços', 'R$ 49,90'],
  ['name', 'Nomes dos produtos e textos', 'PICANHA BOVINA'],
];

export function FontsPanel({ settings: s, onChange }: PanelProps) {
  return (
    <div className="stack">
      <h3>Fontes</h3>
      {FONT_ROLES.map(([role, label, sample]) => (
        <label className="field" key={role}>
          {label}
          <select value={s.fonts[role]} onChange={(e) => onChange({ fonts: { ...s.fonts, [role]: e.target.value } })}>
            {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <span className="font-sample" style={{ fontFamily: fontStack(s.fonts[role]) }}>{sample}</span>
        </label>
      ))}
    </div>
  );
}
