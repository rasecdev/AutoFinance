import { Bot, type Context } from 'grammy';
import type { Env } from '../config/env.js';
import type { Logger } from '../logging/logger.js';
import { createAllowlistMiddleware } from './middleware/allowlist.js';

export function createBot(
  env: Pick<Env, 'telegramBotToken' | 'telegramAllowedChatIds'>,
  logger: Logger,
  handlerTexto: (ctx: Context) => Promise<void>,
): Bot {
  const bot = new Bot(env.telegramBotToken);

  bot.use(createAllowlistMiddleware(env.telegramAllowedChatIds, logger));

  bot.on('message:text', handlerTexto);

  bot.catch((erro) => {
    logger.error({ err: erro.error }, 'erro não tratado no bot — processo continua rodando');
  });

  return bot;
}
