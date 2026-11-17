// Prepara o serviço de fotos em Python: cria servico-fotos/.venv e instala as dependências.
// Uso: npm run instalar-servico   (precisa do Python 3.10–3.12 instalado)
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pythonDoServico } from './python.mjs';

const venvPython = pythonDoServico();
const rodar = (cmd) => {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
};

if (!existsSync(venvPython)) {
  // Inclui o caminho padrão do instalador (útil logo após instalar, antes do PATH atualizar).
  const padraoWin = process.env.LOCALAPPDATA ? `"${process.env.LOCALAPPDATA}\\Programs\\Python\\Python312\\python.exe"` : null;
  const candidatos =
    process.platform === 'win32'
      ? ['py -3.12', padraoWin, 'py -3', 'python'].filter(Boolean)
      : ['python3.12', 'python3'];
  const python = candidatos.find((c) => {
    try {
      execSync(`${c} --version`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });
  if (!python) {
    console.error('\nPython não encontrado. Instale o Python 3.12 (https://www.python.org/downloads/ ou "winget install Python.Python.3.12") e rode de novo.\n');
    process.exit(1);
  }
  rodar(`${python} -m venv servico-fotos/.venv`);
}

rodar(`"${venvPython}" -m pip install --upgrade pip`);
rodar(`"${venvPython}" -m pip install -r servico-fotos/requirements.txt`);
console.log('\nServiço de fotos pronto. Rode "npm start".\n');
