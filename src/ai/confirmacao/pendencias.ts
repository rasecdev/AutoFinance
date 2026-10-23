import type { ToolDefinition } from '../tools/types.js';

export type PendenciaConfirmacao = {
  tool: ToolDefinition;
  argumentos: unknown;
};

// chatId: number (Telegram) | string (WhatsApp — Fase 9 Rodada 2), valor
// opaco nos dois casos.
const pendencias = new Map<number | string, PendenciaConfirmacao>();

export function definirPendencia(chatId: number | string, pendencia: PendenciaConfirmacao): void {
  pendencias.set(chatId, pendencia);
}

export function obterPendencia(chatId: number | string): PendenciaConfirmacao | undefined {
  return pendencias.get(chatId);
}

export function removerPendencia(chatId: number | string): void {
  pendencias.delete(chatId);
}

const RESPOSTAS_AFIRMATIVAS = new Set(['sim', 's', 'confirmo', 'confirma', 'ok']);

export function ehConfirmacaoAfirmativa(texto: string): boolean {
  return RESPOSTAS_AFIRMATIVAS.has(texto.trim().toLowerCase());
}
