import type { Context } from 'grammy';
import { definirModeloAtivo, obterModeloAtivo } from '../modeloAtivo.js';

export function createHandlerModelo() {
  return async function handlerModelo(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const texto = ctx.message?.text;

    if (chatId === undefined || texto === undefined) {
      return;
    }

    const nomeModelo = texto.replace(/^\/modelo\s*/i, '').trim();

    if (nomeModelo.length === 0) {
      await ctx.reply(`Modelo ativo neste chat: ${obterModeloAtivo(chatId)}`);
      return;
    }

    definirModeloAtivo(chatId, nomeModelo);
    await ctx.reply(
      `Modelo trocado para "${nomeModelo}" neste chat. Use o slug do OpenRouter (ex: "openai/gpt-4o-mini", "qwen/qwen3-32b"), não o nome de exibição — se a próxima mensagem falhar, o nome pode estar errado.`,
    );
  };
}
