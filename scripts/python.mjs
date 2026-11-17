// Caminho do Python do ambiente virtual do serviço de fotos.
export const pythonDoServico = () =>
  process.platform === 'win32' ? 'servico-fotos/.venv/Scripts/python.exe' : 'servico-fotos/.venv/bin/python';
