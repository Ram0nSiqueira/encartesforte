import { FORMATS } from '../formats';
import { GRID_OPTIONS } from '../layout';
import type { FooterStyle, FormatId, Settings, TextSize } from '../types';

const ZOOMS = [25, 30, 40, 50, 60, 70, 80, 90, 100];

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

export function Toolbar({ settings: s, onChange }: Props) {
  const groups = [...new Set(FORMATS.map((f) => f.group))];
  return (
    <div className="toolbar">
      <label>
        Modelo
        <select value={s.format} onChange={(e) => onChange({ format: e.target.value as FormatId })}>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {FORMATS.filter((f) => f.group === g).map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label>
        Grade
        <select value={s.grid} onChange={(e) => onChange({ grid: e.target.value })}>
          {GRID_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label>
        Texto
        <select value={s.textSize} onChange={(e) => onChange({ textSize: e.target.value as TextSize })}>
          <option value="lg">Texto grande</option>
          <option value="md">Texto médio</option>
          <option value="sm">Texto pequeno</option>
        </select>
      </label>
      <label>
        Rodapé
        <select value={s.footer} onChange={(e) => onChange({ footer: e.target.value as FooterStyle })}>
          <option value="faixa">Faixa</option>
          <option value="redondo">Redondo</option>
          <option value="compacto">Compacto</option>
        </select>
      </label>
      <label>
        Zoom
        <select
          value={String(s.zoom)}
          onChange={(e) => onChange({ zoom: e.target.value === 'auto' ? 'auto' : Number(e.target.value) })}
        >
          <option value="auto">Auto</option>
          {ZOOMS.map((z) => <option key={z} value={z}>{z}%</option>)}
        </select>
      </label>
    </div>
  );
}
