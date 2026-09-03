import { MODELO_PADRAO } from '../ai/openrouter.js';
import type { DbClient } from '../db/client.js';
import { obterModeloRoteamento } from '../db/repositories/roteamentoTarefas.js';

const FLUXO_CONVERSA_TEXTO = 'conversa_texto';

const modeloPorChat = new Map<number, string>();

export function definirModeloAtivo(chatId: number, modelo: string): void {
  modeloPorChat.set(chatId, modelo);
}

// Só o override explícito por chat (Fase 4, /modelo) — undefined quando o chat
// nunca trocou. Use resolverModeloConversa pra obter o modelo que de fato vai
// ser usado (override > roteamento_tarefas > padrão).
export function obterOverrideModelo(chatId: number): string | undefined {
  return modeloPorChat.get(chatId);
}

// Ordem de precedência (Fase 5, Tarefa 22): override do chat sempre vence —
// é decisão explícita e pontual; roteamento_tarefas é o padrão de fábrica do
// fluxo; MODELO_PADRAO é o último fallback quando nem a tabela tem linha.
export function resolverModeloConversa(db: DbClient, chatId: number): string {
  return (
    obterOverrideModelo(chatId) ?? obterModeloRoteamento(db, FLUXO_CONVERSA_TEXTO) ?? MODELO_PADRAO
  );
}
