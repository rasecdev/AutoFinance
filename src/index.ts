import { createOpenRouterClient } from './ai/openrouter.js';
import { createBot } from './bot/bot.js';
import { createHandlerMidia } from './bot/handlers/midia.js';
import { createHandlerTexto } from './bot/handlers/texto.js';
import { loadEnv } from './config/env.js';
import { getDb } from './db/client.js';
import { migrate } from './db/migrate.js';
import { registerGlobalErrorHandlers } from './logging/errorHandler.js';
import { logger } from './logging/logger.js';

registerGlobalErrorHandlers(logger);

const env = loadEnv();

const db = getDb(env);
migrate(db);

const openRouterClient = createOpenRouterClient(env.openrouterApiKey);
const handlerTexto = createHandlerTexto(openRouterClient, db, logger);
const handlerMidia = createHandlerMidia(logger);

const bot = createBot(env, logger, handlerTexto, handlerMidia);

bot.start({
  onStart: () => {
    logger.info({ ambiente: env.ambiente }, 'bot iniciado (long polling)');
  },
});
