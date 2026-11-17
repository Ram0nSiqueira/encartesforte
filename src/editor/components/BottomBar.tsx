import { Download, FileText, Printer } from 'lucide-react';

interface Props {
  pageCount: number;
  scale: number;
  busy: string | null;
  error: string;
  onScale: (s: number) => void;
  onPng: () => void;
  onPdf: () => void;
  onPrint: () => void;
}

const SCALES: [number, string][] = [
  [1, '1x (leve)'],
  [2, '2x (normal)'],
  [3, '3x (alta)'],
  [4, '4x (impressão)'],
];

export function BottomBar({ pageCount, scale, busy, error, onScale, onPng, onPdf, onPrint }: Props) {
  return (
    <div className="bottombar">
      <span className="bottombar__info">
        {pageCount} {pageCount === 1 ? 'página' : 'páginas'}
        {busy && <em> · {busy}</em>}
        {error && <strong className="bottombar__error"> · {error}</strong>}
      </span>
      <div className="bottombar__actions">
        <label className="scale-select">
          Qualidade
          <select value={scale} onChange={(e) => onScale(Number(e.target.value))}>
            {SCALES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <button type="button" className="btn-primary" onClick={onPng} disabled={!!busy}>
          <Download size={16} /> Baixar PNG
        </button>
        <button type="button" className="btn-secondary" onClick={onPdf} disabled={!!busy}>
          <FileText size={16} /> Baixar PDF
        </button>
        <button type="button" className="btn-secondary" onClick={onPrint} disabled={!!busy}>
          <Printer size={16} /> Imprimir
        </button>
      </div>
    </div>
  );
}
