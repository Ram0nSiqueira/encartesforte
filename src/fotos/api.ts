// Fotos principais dos produtos, guardadas no Supabase (banco + pasta de imagens na internet).
// Assim a foto enviada em um aparelho aparece em qualquer outro.
// O fundo é removido no próprio navegador (recorte.ts) antes de enviar.
import { removerFundo, type AoBaixar } from './recorte';

const URL_SUPABASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const CHAVE = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '';
const PASTA = 'fotos-produtos';
/** Endereço público das imagens (ex.: <PREFIXO>abc123.png). */
export const PREFIXO_IMAGENS = `${URL_SUPABASE}/storage/v1/object/public/${PASTA}/`;

export interface FotoPrincipal {
  nome: string;
  codigo: string;
  /** Endereço da versão sem fundo; as outras são "-branco.png" e "-original.png". */
  imagem_url: string;
  sem_fundo: boolean;
  aviso?: string;
}

export const bancoConfigurado = () => !!URL_SUPABASE && !!CHAVE;

const cabecalhos = (extra: Record<string, string> = {}) => ({ apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, ...extra });

async function chamar(caminho: string, init: RequestInit = {}) {
  if (!bancoConfigurado()) throw new Error('O banco de fotos não está configurado (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).');
  let res: Response;
  try {
    res = await fetch(`${URL_SUPABASE}${caminho}`, { ...init, signal: AbortSignal.timeout(60000) });
  } catch {
    throw new Error('Sem conexão com o banco de fotos. Verifique a internet.');
  }
  if (!res.ok) {
    const corpo = await res.text().catch(() => '');
    console.error('[fotos] Supabase', res.status, corpo);
    throw new Error(`O banco de fotos respondeu com erro (${res.status}).`);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Chaves: o mesmo produto é encontrado pelo código de barras e pelo nome.
// "Arroz Tio João 5kg" e "arroz tio joao 5KG" dão a mesma chave.
// ---------------------------------------------------------------------------
export const normalizar = (t: string) =>
  t.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');

const ehCodigo = (t: string) => /^\d{8,14}$/.test(t);

function chavesDoProduto(nome: string, codigo: string) {
  const chaves: string[] = [];
  if (ehCodigo(codigo)) chaves.push(`codigo:${codigo}`);
  if (nome.trim()) chaves.push(normalizar(nome));
  return chaves;
}

const filtroChaves = (chaves: string[]) => `in.(${chaves.map((c) => `"${c.replace(/"/g, '\\"')}"`).join(',')})`;

interface Linha { chave: string; nome: string; codigo: string | null; arquivo: string; sem_fundo: boolean }

const paraFoto = (l: Linha): FotoPrincipal => ({
  nome: l.nome, codigo: l.codigo ?? '', imagem_url: PREFIXO_IMAGENS + l.arquivo, sem_fundo: l.sem_fundo,
});

/** Procura a foto salva do produto (primeiro pelo código de barras, depois pelo nome). */
export async function buscarFotoPrincipal(nome: string, codigo: string): Promise<FotoPrincipal | null> {
  const chaves = chavesDoProduto(nome, codigo);
  if (!chaves.length) return null;
  const params = new URLSearchParams({ select: 'chave,nome,codigo,arquivo,sem_fundo', chave: filtroChaves(chaves) });
  const linhas: Linha[] = await (await chamar(`/rest/v1/fotos_principais?${params}`, { headers: cabecalhos() })).json();
  for (const c of chaves) {
    const l = linhas.find((x) => x.chave === c);
    if (l) return paraFoto(l);
  }
  return null;
}

async function enviarImagem(arquivo: string, blob: Blob) {
  await chamar(`/storage/v1/object/${PASTA}/${arquivo}`, {
    method: 'POST',
    headers: cabecalhos({ 'Content-Type': 'image/png', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }),
    body: blob,
  });
}

async function identificador(blob: Blob) {
  const hash = await crypto.subtle.digest('SHA-1', await blob.arrayBuffer());
  return [...new Uint8Array(hash)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Tira o fundo da foto (no navegador) e salva no banco como foto principal do produto.
 * Se o banco estiver fora do ar, devolve a foto recortada mesmo assim (`salva: false`).
 */
export async function salvarFotoPrincipal(
  arquivo: Blob, nome: string, codigo: string, aoBaixar?: AoBaixar,
): Promise<FotoPrincipal & { salva: boolean; local?: Blob }> {
  const chaves = chavesDoProduto(nome, codigo);
  if (!chaves.length) throw new Error('Informe o nome (ou o código de barras) do produto antes de enviar a foto.');
  const r = await removerFundo(arquivo, aoBaixar);
  const base = { nome, codigo, sem_fundo: r.recortou, aviso: r.aviso };
  try {
    const id = `usuario-${await identificador(r.original)}`;
    await Promise.all([
      enviarImagem(`${id}.png`, r.semFundo),
      enviarImagem(`${id}-branco.png`, r.branco),
      enviarImagem(`${id}-original.png`, r.original),
    ]);
    const agora = new Date().toISOString();
    await chamar('/rest/v1/fotos_principais', {
      method: 'POST',
      headers: cabecalhos({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(chaves.map((chave) => ({
        chave, nome, codigo: ehCodigo(codigo) ? codigo : null, arquivo: `${id}.png`, sem_fundo: r.recortou, atualizado_em: agora,
      }))),
    });
    return { ...base, imagem_url: `${PREFIXO_IMAGENS}${id}.png`, salva: true };
  } catch (e) {
    console.error('[fotos] não foi possível salvar no banco', e);
    return { ...base, imagem_url: '', salva: false, local: r.semFundo, aviso: (e as Error).message };
  }
}

/** Deixa de usar a foto principal do produto (as imagens continuam guardadas). */
export async function esquecerFotoPrincipal(nome: string, codigo: string): Promise<void> {
  const chaves = chavesDoProduto(nome, codigo);
  if (!chaves.length) return;
  await chamar(`/rest/v1/fotos_principais?${new URLSearchParams({ chave: filtroChaves(chaves) })}`, {
    method: 'DELETE', headers: cabecalhos(),
  });
}
