import { Bot } from 'grammy';
import type { Env } from '../config/env.js';
import type { Logger } from '../logging/logger.js';
import { createAllowlistMiddleware } from './middleware/allowlist.js';

export function createBot(
  env: Pick<Env, 'telegramBotToken' | 'telegramAllowedChatIds'>,
  logger: Logger,
): Bot {
  const bot = new Bot(env.telegramBotToken);

  bot.use(createAllowlistMiddleware(env.telegramAllowedChatIds, logger));

  bot.on('message:text', async (ctx) => {
    await ctx.reply('Mensagem recebida.');
  });

  bot.catch((erro) => {
    logger.error({ err: erro.error }, 'erro não tratado no bot — processo continua rodando');
  });

  return bot;
}
