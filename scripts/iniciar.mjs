// Sobe o site (Vite) e o serviço de fotos em Python juntos. Ctrl+C encerra os dois.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pythonDoServico } from './python.mjs';

const abrir = process.argv.includes('--open');
const python = pythonDoServico();
/** @type {import('node:child_process').ChildProcess | null} */
let servicoFotos = null;
let encerrando = false;

if (existsSync(python)) {
  const servico = spawn(python, ['servico-fotos/app.py'], { stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1' } });
  // Se o serviço de fotos cair, o site continua no ar.
  servico.on('exit', (code) => {
    if (!encerrando) console.warn(`\n[fotos] O serviço de fotos parou (código ${code}). O site continua funcionando sem ele.\n`);
  });
  servicoFotos = servico;
} else {
  console.warn('\n[fotos] Serviço de fotos não instalado: o site vai funcionar, mas sem busca de produtos e sem remoção de fundo.');
  console.warn('[fotos] Para instalar: npm run instalar-servico\n');
}

// Comando inteiro numa string (com shell), como o Windows exige para o "npx".
const site = spawn(`npx vite${abrir ? ' --open' : ''}`, { stdio: 'inherit', shell: true });

const encerrar = (codigo = 0) => {
  if (encerrando) return;
  encerrando = true;
  for (const p of [servicoFotos, site]) if (p && !p.killed) p.kill();
  process.exit(codigo);
};

site.on('exit', (code) => encerrar(code ?? 0));
process.on('SIGINT', () => encerrar(0));
process.on('SIGTERM', () => encerrar(0));
