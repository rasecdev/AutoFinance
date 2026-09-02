// Correlaciona o message_id da resposta do bot no Telegram com o trace_id da
// interação em interacoes_ia — permite localizar a interação a partir de um
// reply do usuário na mensagem do bot, sem precisar conhecer/expor o trace_id.
// Em memória (mesmo padrão de confirmacao.ts/contextoRecente.ts): reseta no
// restart do processo, aceitável pro escopo de feedback (Tarefa 16).
const traceIdPorMensagem = new Map<number, string>();

export function definirRastroResposta(messageId: number, traceId: string): void {
  traceIdPorMensagem.set(messageId, traceId);
}

export function obterTraceIdPorMensagem(messageId: number): string | undefined {
  return traceIdPorMensagem.get(messageId);
}
