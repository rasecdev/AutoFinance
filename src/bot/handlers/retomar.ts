import type { Context } from 'grammy';
import type { DbClient } from '../../db/client.js';
import { estaPausado, retomar } from '../../db/repositories/botPausado.js';

export function createHandlerRetomar(db: DbClient) {
  return async function handlerRetomar(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) {
      return;
    }

    const estavaPausado = estaPausado(db, chatId);
    retomar(db, chatId);

    await ctx.reply(estavaPausado ? 'Bot retomado — voltando a processar mensagens normalmente.' : 'Não havia pausa ativa neste chat.');
  };
}
