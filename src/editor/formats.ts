import type { FormatId } from './types';

export interface FormatDef {
  id: FormatId;
  label: string;
  group: string;
  width: number;
  height: number;
  /** Máximo de produtos por página na grade automática. */
  maxPerPage: number;
}

export const FORMATS: FormatDef[] = [
  { id: 'feed', label: 'Feed quadrado (1080×1080)', group: 'Redes sociais', width: 1080, height: 1080, maxPerPage: 9 },
  { id: 'insta', label: 'Feed Instagram retrato (1080×1350)', group: 'Redes sociais', width: 1080, height: 1350, maxPerPage: 12 },
  { id: 'stories', label: 'Stories / Status (1080×1920)', group: 'Redes sociais', width: 1080, height: 1920, maxPerPage: 12 },
  { id: 'a4', label: 'A4 vertical', group: 'Impressão', width: 794, height: 1123, maxPerPage: 20 },
  { id: 'a4h', label: 'A4 horizontal', group: 'Impressão', width: 1123, height: 794, maxPerPage: 15 },
  { id: 'tv', label: 'TV horizontal (1920×1080)', group: 'TV', width: 1920, height: 1080, maxPerPage: 10 },
];

export const getFormat = (id: FormatId): FormatDef => FORMATS.find((f) => f.id === id) ?? FORMATS[0];
