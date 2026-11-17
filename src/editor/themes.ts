export interface Theme {
  id: string;
  name: string;
  primary: string;
  primaryDark: string;
  secondary: string;
  titleColor: string;
  titleShadow: string;
  bg: string;
  dot: string;
  cardBg: string;
  nameColor: string;
  priceBg: string;
  priceText: string;
  oldColor: string;
  footerBg: string;
  footerText: string;
  defaultTitle: string;
  defaultSubtitle: string;
}

export const THEMES: Theme[] = [
  {
    id: 'oferta', name: 'Ofertas da Semana',
    primary: '#e30613', primaryDark: '#8f0010', secondary: '#ffd200',
    titleColor: '#ffffff', titleShadow: '#6b000b',
    bg: '#f3f3f3', dot: 'rgba(0,0,0,0.07)', cardBg: '#ffffff', nameColor: '#2b2b2b',
    priceBg: '#ffd200', priceText: '#c8000f', oldColor: '#666666',
    footerBg: '#8f0010', footerText: '#ffffff',
    defaultTitle: 'OFERTAS', defaultSubtitle: 'da semana',
  },
  {
    id: 'hortifruti', name: 'Hortifrúti',
    primary: '#2e9e3f', primaryDark: '#145a22', secondary: '#ffb627',
    titleColor: '#fffbe6', titleShadow: '#0d3d17',
    bg: '#eef7e8', dot: 'rgba(20,90,34,0.09)', cardBg: '#ffffff', nameColor: '#1d3b22',
    priceBg: '#ffb627', priceText: '#145a22', oldColor: '#5d6b5f',
    footerBg: '#145a22', footerText: '#ffffff',
    defaultTitle: 'HORTIFRÚTI', defaultSubtitle: 'fresquinho todo dia',
  },
  {
    id: 'acougue', name: 'Açougue',
    primary: '#8a1518', primaryDark: '#3b0708', secondary: '#f2c14e',
    titleColor: '#ffffff', titleShadow: '#200304',
    bg: '#f8efe6', dot: 'rgba(59,7,8,0.08)', cardBg: '#ffffff', nameColor: '#3b0708',
    priceBg: '#f2c14e', priceText: '#7a1114', oldColor: '#6b5a52',
    footerBg: '#3b0708', footerText: '#ffffff',
    defaultTitle: 'AÇOUGUE', defaultSubtitle: 'carnes selecionadas',
  },
  {
    id: 'blackfriday', name: 'Black Friday',
    primary: '#1c1c1c', primaryDark: '#000000', secondary: '#ffd600',
    titleColor: '#ffd600', titleShadow: '#000000',
    bg: '#262626', dot: 'rgba(255,255,255,0.06)', cardBg: '#ffffff', nameColor: '#111111',
    priceBg: '#ffd600', priceText: '#111111', oldColor: '#666666',
    footerBg: '#000000', footerText: '#ffd600',
    defaultTitle: 'BLACK FRIDAY', defaultSubtitle: 'preços imbatíveis',
  },
  {
    id: 'natal', name: 'Natal',
    primary: '#c8102e', primaryDark: '#6e0918', secondary: '#1f7a3a',
    titleColor: '#ffe9a8', titleShadow: '#4a0410',
    bg: '#fbf5ec', dot: 'rgba(31,122,58,0.09)', cardBg: '#ffffff', nameColor: '#3a1d1d',
    priceBg: '#1f7a3a', priceText: '#ffffff', oldColor: '#6b5a5a',
    footerBg: '#1f7a3a', footerText: '#ffffff',
    defaultTitle: 'OFERTAS DE NATAL', defaultSubtitle: 'boas festas!',
  },
  {
    id: 'azul', name: 'Super Azul',
    primary: '#0b5cd5', primaryDark: '#062f73', secondary: '#ffcc00',
    titleColor: '#ffffff', titleShadow: '#031d4a',
    bg: '#edf2fb', dot: 'rgba(6,47,115,0.08)', cardBg: '#ffffff', nameColor: '#0f2347',
    priceBg: '#ffcc00', priceText: '#062f73', oldColor: '#5a6478',
    footerBg: '#062f73', footerText: '#ffffff',
    defaultTitle: 'SUPER OFERTAS', defaultSubtitle: 'economia de verdade',
  },
  {
    id: 'fimdesemana', name: 'Fim de Semana',
    primary: '#ff6a00', primaryDark: '#b33a00', secondary: '#fff200',
    titleColor: '#ffffff', titleShadow: '#7a2700',
    bg: '#fff4e8', dot: 'rgba(179,58,0,0.08)', cardBg: '#ffffff', nameColor: '#3d1a05',
    priceBg: '#e30613', priceText: '#ffffff', oldColor: '#6e5a4e',
    footerBg: '#b33a00', footerText: '#ffffff',
    defaultTitle: 'FIM DE SEMANA', defaultSubtitle: 'ofertas imperdíveis',
  },
];

export const getTheme = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0];
