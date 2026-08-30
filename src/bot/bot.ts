import { Bot } from 'grammy';
import type { Env } from '../config/env.js';
import type { Logger } from '../logging/logger.js';
import { createAllowlistMiddleware } from './middleware/allowlist.js';
import { registerRoutes, type Handler } from './router.js';

export function createBot(
  env: Pick<Env, 'telegramBotToken' | 'telegramAllowedChatIds'>,
  logger: Logger,
  handlerTexto: Handler,
  handlerMidia: Handler,
): Bot {
  const bot = new Bot(env.telegramBotToken);

  bot.use(createAllowlistMiddleware(env.telegramAllowedChatIds, logger));

  registerRoutes(bot, handlerTexto, handlerMidia);

  bot.catch((erro) => {
    logger.error({ err: erro.error }, 'erro não tratado no bot — processo continua rodando');
  });

  return bot;
}
