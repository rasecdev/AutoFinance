import { MODELO_PADRAO } from '../ai/openrouter.js';

const modeloPorChat = new Map<number, string>();

export function definirModeloAtivo(chatId: number, modelo: string): void {
  modeloPorChat.set(chatId, modelo);
}

export function obterModeloAtivo(chatId: number): string {
  return modeloPorChat.get(chatId) ?? MODELO_PADRAO;
}
