import { randomUUID } from 'node:crypto';
import type { Context } from 'grammy';
import type { Logger } from '../../logging/logger.js';

const MENSAGEM = 'Esse tipo de mensagem ainda não é suportado.';

export function createHandlerNaoSuportado(logger: Logger) {
  return async function handlerNaoSuportado(ctx: Context): Promise<void> {
    const traceId = randomUUID();

    logger
      .child({ traceId })
      .warn({ updateId: ctx.update.update_id }, 'tipo de mensagem não suportado recebido');

    await ctx.reply(MENSAGEM);
  };
}
