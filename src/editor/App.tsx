import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BottomBar } from './components/BottomBar';
import { FlyerPage } from './components/FlyerPage';
import { ProductsPanel, type Focus } from './components/ProductsPanel';
import { CompanyPanel, DatesPanel, FontsPanel, LogoPanel, ThemesPanel } from './components/SettingsPanels';
import { Sidebar, type TabId } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { exportPdf, exportPng, fileBaseName } from './export';
import { getFormat } from './formats';
import { paginate } from './layout';
import { useEditorState } from './state';
import { getTheme } from './themes';

export default function App() {
  const { state, setSettings, setProducts, saveError } = useEditorState();
  const { products, settings } = state;

  const [tab, setTab] = useState<TabId>('produtos');
  const [panelOpen, setPanelOpen] = useState(true);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fmt = getFormat(settings.format);
  const theme = getTheme(settings.themeId);
  const pages = useMemo(() => paginate(products, settings, fmt), [products, settings, fmt]);

  // Zoom automático: cabe a página inteira na área visível.
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 900, h: 700 });
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setCanvasSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale =
    settings.zoom === 'auto'
      ? Math.max(0.1, Math.min(1, (canvasSize.w - 8) / fmt.width, (canvasSize.h - 44) / fmt.height))
      : settings.zoom / 100;

  const pageNodes = useRef<(HTMLDivElement | null)[]>([]);
  const allNodes = () => pageNodes.current.slice(0, pages.length).filter((n): n is HTMLDivElement => !!n);
  const baseName = fileBaseName(settings.title);

  const run = async (label: string, job: () => Promise<void>) => {
    setBusy(label);
    setError('');
    try {
      await job();
    } catch (e) {
      console.error(e);
      setError('Não foi possível gerar o arquivo. Tente uma qualidade menor.');
    } finally {
      setBusy(null);
    }
  };

  const openTab = (t: TabId) => {
    if (t === tab && panelOpen) setPanelOpen(false);
    else {
      setTab(t);
      setPanelOpen(true);
    }
  };

  const panelProps = { settings, onChange: setSettings };

  return (
    <div className="app">
      <header className="topbar">
        <a href="../" className="topbar__logo">Encartes<span>Forte</span></a>
        <span className="topbar__status">
          {saveError ? '⚠ Não foi possível salvar (imagens muito grandes?)' : '✓ Salvo automaticamente neste navegador'}
        </span>
      </header>

      <div className="workspace">
        <Sidebar active={tab} panelOpen={panelOpen} onSelect={openTab} />

        {panelOpen && (
          <aside className="panel">
            {tab === 'produtos' && <ProductsPanel products={products} setProducts={setProducts} focus={focus} />}
            {tab === 'temas' && <ThemesPanel {...panelProps} />}
            {tab === 'datas' && <DatesPanel {...panelProps} />}
            {tab === 'logo' && <LogoPanel {...panelProps} />}
            {tab === 'empresa' && <CompanyPanel {...panelProps} />}
            {tab === 'fontes' && <FontsPanel {...panelProps} />}
          </aside>
        )}
        <button
          type="button"
          className="panel-toggle"
          onClick={() => setPanelOpen((o) => !o)}
          title={panelOpen ? 'Esconder painel' : 'Mostrar painel'}
        >
          {panelOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>

        <main className="stage">
          <Toolbar settings={settings} onChange={setSettings} />

          <div className="canvas" ref={canvasRef}>
            {pages.map((layout, i) => (
              <div className="page-slot" key={i}>
                <div className="page-slot__frame" style={{ width: fmt.width * scale, height: fmt.height * scale }}>
                  <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                    <FlyerPage
                      layout={layout}
                      fmt={fmt}
                      theme={theme}
                      settings={settings}
                      pageRef={(el) => { pageNodes.current[i] = el; }}
                      onProductClick={(id) => {
                        setTab('produtos');
                        setPanelOpen(true);
                        setFocus({ id, at: Date.now() });
                      }}
                      onEmptyClick={() => {
                        setTab('produtos');
                        setPanelOpen(true);
                      }}
                    />
                  </div>
                </div>
                <div className="page-slot__meta">
                  <span>Página {i + 1} de {pages.length}</span>
                  {pages.length > 1 && (
                    <button
                      type="button"
                      className="btn-link"
                      disabled={!!busy}
                      onClick={() => {
                        const node = pageNodes.current[i];
                        if (node) run('Gerando PNG…', () => exportPng([node], settings.exportScale, baseName, [i + 1]));
                      }}
                    >
                      <Download size={13} /> baixar só esta página
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <BottomBar
            pageCount={pages.length}
            scale={settings.exportScale}
            busy={busy}
            error={error}
            onScale={(s) => setSettings({ exportScale: s })}
            onPng={() => run('Gerando PNG…', () => exportPng(allNodes(), settings.exportScale, baseName))}
            onPdf={() => run('Gerando PDF…', () => exportPdf(allNodes(), fmt, settings.exportScale, baseName, 'download'))}
            onPrint={() => run('Preparando impressão…', () => exportPdf(allNodes(), fmt, settings.exportScale, baseName, 'print'))}
          />
        </main>
      </div>
    </div>
  );
}
