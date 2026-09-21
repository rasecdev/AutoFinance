import type { Context } from 'grammy';
import type { DbClient } from '../../db/client.js';
import { estaPausado, pausar } from '../../db/repositories/botPausado.js';

// ASI10 (Rogue Agents) -- kill switch acionável pelo próprio usuário, sem
// depender de revogar o token no BotFather. Idempotente: pausar um chat já
// pausado só confirma o estado, não lança erro.
export function createHandlerPausar(db: DbClient) {
  return async function handlerPausar(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) {
      return;
    }

    const jaEstavaPausado = estaPausado(db, chatId);
    pausar(db, chatId);

    await ctx.reply(
      jaEstavaPausado
        ? 'Já estava pausado — nenhuma mensagem é processada até /retomar.'
        : 'Bot pausado. Nenhuma mensagem é processada até você mandar /retomar.',
    );
  };
}
