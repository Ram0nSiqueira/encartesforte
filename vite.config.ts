import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Remoção de fundo no navegador (src/fotos/recorte.worker.ts).
  worker: { format: 'es' },
  // Mesmos cabeçalhos do vercel.json: liberam o recorte em vários núcleos (mais rápido).
  server: {
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' },
  },
  preview: {
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' },
  },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  build: {
    rollupOptions: {
      input: {
        main: page('./index.html'),
        editor: page('./editor/index.html'),
        produto: page('./produto/index.html'),
        fotos: page('./fotos/index.html'),
      },
    },
  },
});
