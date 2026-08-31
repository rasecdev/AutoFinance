import type { PendenciaConfirmacao } from '../ai/openrouter.js';

const pendencias = new Map<number, PendenciaConfirmacao>();

export function definirPendencia(chatId: number, pendencia: PendenciaConfirmacao): void {
  pendencias.set(chatId, pendencia);
}

export function obterPendencia(chatId: number): PendenciaConfirmacao | undefined {
  return pendencias.get(chatId);
}

export function removerPendencia(chatId: number): void {
  pendencias.delete(chatId);
}

const RESPOSTAS_AFIRMATIVAS = new Set(['sim', 's', 'confirmo', 'confirma', 'ok']);

export function ehConfirmacaoAfirmativa(texto: string): boolean {
  return RESPOSTAS_AFIRMATIVAS.has(texto.trim().toLowerCase());
}
