import { createBot } from './bot/bot.js';
import { loadEnv } from './config/env.js';
import { registerGlobalErrorHandlers } from './logging/errorHandler.js';
import { logger } from './logging/logger.js';

registerGlobalErrorHandlers(logger);

const env = loadEnv();
const bot = createBot(env, logger);

bot.start({
  onStart: () => {
    logger.info({ ambiente: env.ambiente }, 'bot iniciado (long polling)');
  },
});
