import type { ContaPluggy } from '../integracoes/pluggy/cliente.js';

export type PendenciaOpenFinance = {
  itemId: string;
  contas: ContaPluggy[];
};

// Mesmo padrão de googleOAuthPendencia.ts (Fase 7): todo o fluxo acontece
// dentro do mesmo processo do bot (comando lista as contas, resposta
// seguinte confirma o mapeamento) — não precisa da persistência em banco
// usada pra confirmação cross-processo (confirmacoes_pendentes, Fase 7).
// chatId: number (Telegram) | string (WhatsApp, "<numero>@c.us" — Fase 9
// Rodada 2), tratado como valor opaco em qualquer dos dois casos.
const pendencias = new Map<number | string, PendenciaOpenFinance>();

export function definirPendenciaOpenFinance(chatId: number | string, pendencia: PendenciaOpenFinance): void {
  pendencias.set(chatId, pendencia);
}

export function obterPendenciaOpenFinance(chatId: number | string): PendenciaOpenFinance | undefined {
  return pendencias.get(chatId);
}

export function removerPendenciaOpenFinance(chatId: number | string): void {
  pendencias.delete(chatId);
}
