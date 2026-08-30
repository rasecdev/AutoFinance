import { randomUUID } from 'node:crypto';
import type { Context } from 'grammy';
import type { Logger } from '../../logging/logger.js';

const MENSAGEM = 'Recebido — processamento de imagem/PDF ainda não implementado.';

export function createHandlerMidia(logger: Logger) {
  return async function handlerMidia(ctx: Context): Promise<void> {
    const traceId = randomUUID();
    const tipo = ctx.message?.photo ? 'foto' : 'documento';

    logger.child({ traceId }).info({ tipo }, 'mídia recebida — handler ainda não implementado');

    await ctx.reply(MENSAGEM);
  };
}
