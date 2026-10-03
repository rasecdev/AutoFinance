import type { Context } from 'grammy';
import type { DbClient } from '../../db/client.js';
import { estaPausado, retomar } from '../../db/repositories/botPausado.js';
import { obterIdioma } from '../../db/repositories/idiomaBot.js';
import { t } from '../../i18n/t.js';

export function createHandlerRetomar(db: DbClient) {
  return async function handlerRetomar(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) {
      return;
    }

    const idioma = obterIdioma(db);
    const estavaPausado = estaPausado(db, chatId);
    retomar(db, chatId);

    await ctx.reply(t(estavaPausado ? 'bot_retomado' : 'bot_sem_pausa_ativa', idioma));
  };
}
