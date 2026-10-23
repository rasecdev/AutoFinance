import { MODELO_PADRAO } from '../openrouter.js';
import type { DbClient } from '../../db/client.js';
import { obterModeloRoteamento } from '../../db/repositories/roteamentoTarefas.js';

const FLUXO_CONVERSA_TEXTO = 'conversa_texto';

// chatId: number (Telegram) | string (WhatsApp — Fase 9 Rodada 2), valor
// opaco nos dois casos.
const modeloPorChat = new Map<number | string, string>();

export function definirModeloAtivo(chatId: number | string, modelo: string): void {
  modeloPorChat.set(chatId, modelo);
}

// Só o override explícito por chat (Fase 4, /modelo) — undefined quando o chat
// nunca trocou. Use resolverModeloConversa pra obter o modelo que de fato vai
// ser usado (override > roteamento_tarefas > padrão).
export function obterOverrideModelo(chatId: number | string): string | undefined {
  return modeloPorChat.get(chatId);
}

// Ordem de precedência (Fase 5, Tarefa 22): override do chat sempre vence —
// é decisão explícita e pontual; roteamento_tarefas é o padrão de fábrica do
// fluxo; MODELO_PADRAO é o último fallback quando nem a tabela tem linha.
export function resolverModeloConversa(db: DbClient, chatId: number | string): string {
  return (
    obterOverrideModelo(chatId) ?? obterModeloRoteamento(db, FLUXO_CONVERSA_TEXTO) ?? MODELO_PADRAO
  );
}
