import { CalendarDays, Image as ImageIcon, Palette, PlusSquare, Store, Type } from 'lucide-react';
import type { ComponentType } from 'react';

export type TabId = 'produtos' | 'temas' | 'datas' | 'logo' | 'empresa' | 'fontes';

const TABS: { id: TabId; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { id: 'produtos', label: 'Produtos', Icon: PlusSquare },
  { id: 'temas', label: 'Temas', Icon: Palette },
  { id: 'datas', label: 'Datas', Icon: CalendarDays },
  { id: 'logo', label: 'Sua Logo', Icon: ImageIcon },
  { id: 'empresa', label: 'Empresa', Icon: Store },
  { id: 'fontes', label: 'Fontes', Icon: Type },
];

interface Props {
  active: TabId;
  panelOpen: boolean;
  onSelect: (tab: TabId) => void;
}

export function Sidebar({ active, panelOpen, onSelect }: Props) {
  return (
    <nav className="sidebar" aria-label="Ferramentas">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`side-btn${panelOpen && active === id ? ' is-active' : ''}`}
          onClick={() => onSelect(id)}
        >
          <Icon size={22} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
