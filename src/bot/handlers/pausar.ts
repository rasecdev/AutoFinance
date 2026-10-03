import type { Context } from 'grammy';
import type { DbClient } from '../../db/client.js';
import { estaPausado, pausar } from '../../db/repositories/botPausado.js';
import { obterIdioma } from '../../db/repositories/idiomaBot.js';
import { t } from '../../i18n/t.js';

// ASI10 (Rogue Agents) -- kill switch acionável pelo próprio usuário, sem
// depender de revogar o token no BotFather. Idempotente: pausar um chat já
// pausado só confirma o estado, não lança erro.
export function createHandlerPausar(db: DbClient) {
  return async function handlerPausar(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) {
      return;
    }

    const idioma = obterIdioma(db);
    const jaEstavaPausado = estaPausado(db, chatId);
    pausar(db, chatId);

    await ctx.reply(t(jaEstavaPausado ? 'bot_pausado_ja_estava' : 'bot_pausado_confirmacao', idioma));
  };
}
