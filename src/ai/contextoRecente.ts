// chatId: number (Telegram) | string (WhatsApp — Fase 9 Rodada 2), valor
// opaco nos dois casos.
const ultimaTransacaoPorChat = new Map<number | string, number>();

export function definirUltimaTransacao(chatId: number | string, transacaoId: number): void {
  ultimaTransacaoPorChat.set(chatId, transacaoId);
}

export function obterUltimaTransacao(chatId: number | string): number | undefined {
  return ultimaTransacaoPorChat.get(chatId);
}
