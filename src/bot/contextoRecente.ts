const ultimaTransacaoPorChat = new Map<number, number>();

export function definirUltimaTransacao(chatId: number, transacaoId: number): void {
  ultimaTransacaoPorChat.set(chatId, transacaoId);
}

export function obterUltimaTransacao(chatId: number): number | undefined {
  return ultimaTransacaoPorChat.get(chatId);
}
