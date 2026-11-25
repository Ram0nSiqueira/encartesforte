// Remoção de fundo no navegador: conversa com o recorte.worker.ts (segundo plano).
import type { PedidoRecorte, RespostaRecorte } from './recorte.worker';

export interface Recorte {
  semFundo: Blob;
  original: Blob;
  branco: Blob;
  /** false = não deu para separar o produto (as três são a original). */
  recortou: boolean;
  aviso?: string;
  ms: number;
}

/** Progresso do download do modelo (só na primeira vez em cada navegador). */
export type AoBaixar = (baixadoMB: number, totalMB: number) => void;

let worker: Worker | null = null;
let proximo = 1;
const pendentes = new Map<number, { ok: (r: RespostaRecorte) => void; erro: (e: Error) => void; progresso?: AoBaixar }>();

function obterWorker() {
  if (!worker) {
    worker = new Worker(new URL('./recorte.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<RespostaRecorte>) => {
      const r = ev.data;
      const p = pendentes.get(r.id);
      if (!p) return;
      if (r.tipo === 'progresso') { p.progresso?.(r.baixado / 1e6, r.total / 1e6); return; }
      pendentes.delete(r.id);
      if (r.tipo === 'erro') p.erro(new Error(r.mensagem));
      else p.ok(r);
    };
    worker.onerror = (e) => {
      for (const p of pendentes.values()) p.erro(new Error(e.message || 'Falha no recorte.'));
      pendentes.clear();
      worker = null;
    };
  }
  return worker;
}

type SemId<T> = T extends unknown ? Omit<T, 'id'> : never;

function pedir(p: SemId<PedidoRecorte>, progresso?: AoBaixar): Promise<RespostaRecorte> {
  const id = proximo++;
  return new Promise((ok, erro) => {
    pendentes.set(id, { ok, erro, progresso });
    obterWorker().postMessage({ ...p, id } as PedidoRecorte);
  });
}

/** Baixa e carrega o modelo antes do primeiro uso (opcional). */
export async function prepararRecorte(progresso?: AoBaixar) {
  await pedir({ tipo: 'preparar' }, progresso);
}

/** Tira o fundo; devolve sem fundo, original e fundo branco (PNG). */
export async function removerFundo(imagem: Blob, progresso?: AoBaixar): Promise<Recorte> {
  const r = await pedir({ tipo: 'recortar', imagem }, progresso);
  if (r.tipo !== 'resultado') throw new Error('Resposta inesperada do recorte.');
  const { semFundo, original, branco, recortou, aviso, ms } = r;
  return { semFundo, original, branco, recortou, aviso, ms };
}
