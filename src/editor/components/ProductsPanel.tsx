import { ArrowDown, ArrowUp, ImagePlus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { guessEmoji } from '../emoji';
import { fileToDataUrl, IMAGE_ACCEPT } from '../image';
import { formatNumberBR, newId, parseBRNumber, parseProductList, SAMPLE_LIST } from '../parser';
import type { Product } from '../types';

const UNITS = ['', 'kg', 'un', 'L', 'g', 'pct', 'cx', 'dz', 'bdj'];

export interface Focus { id: string; at: number }

interface Props {
  products: Product[];
  setProducts: (fn: (p: Product[]) => Product[]) => void;
  focus: Focus | null;
}

export function ProductsPanel({ products, setProducts, focus }: Props) {
  const [view, setView] = useState<'add' | 'list'>(products.length ? 'list' : 'add');
  const [text, setText] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    if (!focus) return;
    setView('list');
    setHighlight(focus.id);
    const scroll = setTimeout(
      () => document.getElementById(`prod-${focus.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      60,
    );
    const clear = setTimeout(() => setHighlight(null), 1800);
    return () => {
      clearTimeout(scroll);
      clearTimeout(clear);
    };
  }, [focus]);

  const add = () => {
    const parsed = parseProductList(text);
    if (!parsed.length) return;
    setProducts((p) => [...p, ...parsed]);
    setText('');
    setView('list');
  };

  const update = (id: string, patch: Partial<Product>) =>
    setProducts((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id: string) => setProducts((list) => list.filter((p) => p.id !== id));
  const move = (index: number, dir: -1 | 1) =>
    setProducts((list) => {
      const target = index + dir;
      if (target < 0 || target >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });

  return (
    <div className="products-panel">
      <div className="segmented">
        <button type="button" className={view === 'add' ? 'is-active' : ''} onClick={() => setView('add')}>
          Adicionar produtos
        </button>
        <button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')}>
          Meus produtos ({products.length})
        </button>
      </div>

      {view === 'add' ? (
        <div className="add-box">
          <h3>Digite um produto por linha</h3>
          <p className="hint">
            <strong>Exemplos:</strong>
            <br />Picanha kg R$ 49,90
            <br />Cerveja lata 350ml de R$ 4,99 por R$ 3,99
            <br />Fraldinha bovina 1kg
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Cole ou escreva a lista aqui. Ex.: Picanha kg R$ 49,90"
            rows={9}
          />
          <button type="button" className="btn-primary btn-block" onClick={add} disabled={!text.trim()}>
            Adicionar ao encarte
          </button>
          <button type="button" className="btn-link" onClick={() => setText(SAMPLE_LIST)}>
            Preencher com uma lista de exemplo
          </button>
        </div>
      ) : (
        <div className="product-list">
          <div className="product-list__head">
            <span>{products.length} produto(s) no encarte</span>
            {products.length > 0 && (
              <button
                type="button"
                className="btn-link danger"
                onClick={() => confirm('Remover todos os produtos do encarte?') && setProducts(() => [])}
              >
                Remover todos
              </button>
            )}
          </div>

          {products.length === 0 && <p className="hint">Nenhum produto ainda. Use “Adicionar produtos”.</p>}

          {products.map((p, i) => (
            <ProductItem
              key={p.id}
              product={p}
              highlight={highlight === p.id}
              isFirst={i === 0}
              isLast={i === products.length - 1}
              onChange={(patch) => update(p.id, patch)}
              onRemove={() => remove(p.id)}
              onMove={(dir) => move(i, dir)}
            />
          ))}

          <button
            type="button"
            className="btn-secondary btn-block"
            onClick={() => setProducts((l) => [...l, { id: newId(), name: 'Novo produto', price: null, oldPrice: null, unit: '' }])}
          >
            + Produto em branco
          </button>
        </div>
      )}
    </div>
  );
}

interface ItemProps {
  product: Product;
  highlight: boolean;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<Product>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

function ProductItem({ product: p, highlight, isFirst, isLast, onChange, onRemove, onMove }: ItemProps) {
  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      onChange({ image: await fileToDataUrl(file) });
    } catch {
      alert('Não foi possível ler esta imagem. Use PNG, JPG ou WEBP.');
    }
  };

  return (
    <div id={`prod-${p.id}`} className={`product-item${highlight ? ' is-highlight' : ''}`}>
      <label className="product-item__thumb" title="Trocar foto">
        {p.image ? <img src={p.image} alt="" /> : <span>{guessEmoji(p.name)}</span>}
        <span className="product-item__thumb-overlay"><ImagePlus size={18} /></span>
        <input type="file" accept={IMAGE_ACCEPT} hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </label>

      <div className="product-item__fields">
        <input className="product-item__name" value={p.name} onChange={(e) => onChange({ name: e.target.value })} aria-label="Nome do produto" />
        <div className="product-item__row">
          <label>
            De (R$)
            <PriceInput value={p.oldPrice} onChange={(v) => onChange({ oldPrice: v })} placeholder="opcional" />
          </label>
          <label>
            Por (R$)
            <PriceInput value={p.price} onChange={(v) => onChange({ price: v })} placeholder="0,00" />
          </label>
          <label>
            Un.
            <select value={p.unit} onChange={(e) => onChange({ unit: e.target.value })}>
              {UNITS.map((u) => <option key={u} value={u}>{u || '—'}</option>)}
            </select>
          </label>
        </div>
        {p.image && (
          <button type="button" className="btn-link" onClick={() => onChange({ image: undefined })}>
            <X size={12} /> remover foto
          </button>
        )}
      </div>

      <div className="product-item__actions">
        <button type="button" onClick={() => onMove(-1)} disabled={isFirst} title="Subir"><ArrowUp size={15} /></button>
        <button type="button" onClick={() => onMove(1)} disabled={isLast} title="Descer"><ArrowDown size={15} /></button>
        <button type="button" className="danger" onClick={onRemove} title="Remover"><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

function PriceInput({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  const [draft, setDraft] = useState(formatNumberBR(value));
  useEffect(() => setDraft(formatNumberBR(value)), [value]);
  const commit = () => {
    const v = parseBRNumber(draft);
    onChange(v);
    setDraft(formatNumberBR(v));
  };
  return (
    <input
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}
