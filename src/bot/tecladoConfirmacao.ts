import { InlineKeyboard } from 'grammy';

// Apresentação da confirmação por canal (teclado inline do Telegram, Poll do
// WhatsApp). A política (pendências, resposta afirmativa, pergunta) vive em
// src/ai/confirmacao/ — aqui só o que depende do canal.

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
