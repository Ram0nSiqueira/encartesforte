export type FormatId = 'feed' | 'insta' | 'stories' | 'a4' | 'a4h' | 'tv';
export type TextSize = 'lg' | 'md' | 'sm';
export type FooterStyle = 'faixa' | 'redondo' | 'compacto';

export interface Product {
  id: string;
  name: string;
  price: number | null;
  oldPrice: number | null;
  unit: string;
  image?: string;
}

export interface Company {
  name: string;
  phone: string;
  whatsapp: string;
  address: string;
  instagram: string;
  note: string;
}

export interface FontChoice {
  title: string;
  price: string;
  name: string;
}

export interface Settings {
  format: FormatId;
  grid: string; // 'auto' ou 'COLSxROWS'
  textSize: TextSize;
  footer: FooterStyle;
  zoom: 'auto' | number;
  exportScale: number;
  themeId: string;
  title: string;
  subtitle: string;
  showDates: boolean;
  validFrom: string; // yyyy-mm-dd
  validTo: string;
  untilStock: boolean;
  logo?: string;
  logoSize: number;
  company: Company;
  fonts: FontChoice;
}

export interface EditorState {
  products: Product[];
  settings: Settings;
}
