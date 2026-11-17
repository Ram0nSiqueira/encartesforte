import { useCallback, useEffect, useState } from 'react';
import { parseProductList, SAMPLE_LIST } from './parser';
import type { EditorState, Product, Settings } from './types';

const STORAGE_KEY = 'encartesforte:v1';

export const toISODate = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

export function defaultState(): EditorState {
  const today = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 6);
  return {
    products: [],
    settings: {
      format: 'feed',
      grid: 'auto',
      textSize: 'md',
      footer: 'faixa',
      zoom: 'auto',
      exportScale: 2,
      themeId: 'oferta',
      title: 'OFERTAS',
      subtitle: 'da semana',
      showDates: true,
      validFrom: toISODate(today),
      validTo: toISODate(end),
      untilStock: true,
      logo: undefined,
      logoSize: 13,
      company: { name: 'Seu Supermercado', phone: '', whatsapp: '', address: '', instagram: '', note: '' },
      fonts: { title: 'Anton', price: 'Anton', name: 'Montserrat' },
    },
  };
}

function load(): EditorState {
  const d = defaultState();
  let state = d;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<EditorState>;
      state = {
        products: Array.isArray(saved.products) ? saved.products : [],
        settings: {
          ...d.settings,
          ...saved.settings,
          company: { ...d.settings.company, ...saved.settings?.company },
          fonts: { ...d.settings.fonts, ...saved.settings?.fonts },
        },
      };
    }
  } catch {
    state = d;
  }
  // ?exemplo carrega produtos de demonstração quando o encarte está vazio
  if (state.products.length === 0 && new URLSearchParams(location.search).has('exemplo')) {
    state = { ...state, products: parseProductList(SAMPLE_LIST) };
  }
  return state;
}

export function useEditorState() {
  const [state, setState] = useState<EditorState>(load);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setSaveError(false);
      } catch {
        setSaveError(true);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [state]);

  const setSettings = useCallback(
    (patch: Partial<Settings>) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
    [],
  );
  const setProducts = useCallback(
    (fn: (p: Product[]) => Product[]) => setState((s) => ({ ...s, products: fn(s.products) })),
    [],
  );

  return { state, setSettings, setProducts, saveError };
}
