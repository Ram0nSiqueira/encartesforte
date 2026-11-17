// Fontes empacotadas localmente (mesma origem), para que a exportação em PNG/PDF consiga embuti-las.
import '@fontsource/anton/latin-400.css';
import '@fontsource/bebas-neue/latin-400.css';
import '@fontsource/montserrat/latin-700.css';
import '@fontsource/montserrat/latin-800.css';
import '@fontsource/montserrat/latin-900.css';
import '@fontsource/oswald/latin-700.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/poppins/latin-800.css';
import '@fontsource/poppins/latin-900.css';

export const FONT_OPTIONS = ['Anton', 'Bebas Neue', 'Montserrat', 'Oswald', 'Poppins'];

export const fontStack = (family: string) => `'${family}', 'Arial Black', Arial, sans-serif`;
