import { randomUUID } from 'node:crypto';
import type { Context } from 'grammy';
import type { DbClient } from '../../db/client.js';
import { obterIdioma } from '../../db/repositories/idiomaBot.js';
import { t } from '../../i18n/t.js';
import type { Logger } from '../../logging/logger.js';

export function createHandlerNaoSuportado(db: DbClient, logger: Logger) {
  return async function handlerNaoSuportado(ctx: Context): Promise<void> {
    const traceId = randomUUID();

    logger
      .child({ traceId })
      .warn({ updateId: ctx.update.update_id }, 'tipo de mensagem não suportado recebido');

    await ctx.reply(t('nao_suportado', obterIdioma(db)));
  };
}
