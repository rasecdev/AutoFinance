import { InlineKeyboard } from 'grammy';
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

// Segunda forma de responder a uma confirmação, além de digitar "sim" (achado
// real: usuário achou o fluxo de texto confuso/sujeito a erro de digitação).
// callback_data fixo (não carrega chatId/tool) porque a pendência já é
// resolvida por chatId no momento do clique, igual ao fluxo de texto.
export const CALLBACK_DATA_CONFIRMAR = 'confirmacao:sim';
export const CALLBACK_DATA_CANCELAR = 'confirmacao:nao';

export function montarTecladoConfirmacao(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Sim', CALLBACK_DATA_CONFIRMAR)
    .text('❌ Cancelar', CALLBACK_DATA_CANCELAR);
}
