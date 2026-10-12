import { InlineKeyboard } from 'grammy';
import type { PendenciaConfirmacao } from '../ai/openrouter.js';

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

// Equivalente do teclado inline pro WhatsApp (Tarefa 135): Poll de 2 opções,
// nome do texto da opção é o próprio "voto" (WAHA não tem callback_data
// próprio) — por isso o rótulo em si (não um id) é o que o webhook compara
// de volta em poll.vote.
export const PERGUNTA_POLL_CONFIRMACAO = 'Confirma essa ação?';
export const OPCAO_POLL_CONFIRMAR = 'Confirmar';
export const OPCAO_POLL_CANCELAR = 'Cancelar';
export const OPCOES_POLL_CONFIRMACAO = [OPCAO_POLL_CONFIRMAR, OPCAO_POLL_CANCELAR];
