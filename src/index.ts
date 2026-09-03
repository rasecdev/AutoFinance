import { createOpenRouterClient } from './ai/openrouter.js';
import { createBot } from './bot/bot.js';
import { createHandlerFeedback } from './bot/handlers/feedback.js';
import { createHandlerMidia } from './bot/handlers/midia.js';
import { createHandlerModelo } from './bot/handlers/modelo.js';
import { createHandlerNaoSuportado } from './bot/handlers/naoSuportado.js';
import { createHandlerTexto } from './bot/handlers/texto.js';
import { loadEnv } from './config/env.js';
import { getDb } from './db/client.js';
import { migrate } from './db/migrate.js';
import { registerGlobalErrorHandlers } from './logging/errorHandler.js';
import { createLogger } from './logging/logger.js';

const env = loadEnv();
const logger = createLogger(undefined, env.logLevel);

registerGlobalErrorHandlers(logger);

const db = getDb(env);
migrate(db);

const openRouterClient = createOpenRouterClient(env.openrouterApiKey);
const handlerTexto = createHandlerTexto(openRouterClient, db, logger);
const handlerMidia = createHandlerMidia(logger);
const handlerNaoSuportado = createHandlerNaoSuportado(logger);
const handlerFeedback = createHandlerFeedback(db, logger, 'incorreto');
const handlerFeedbackCorreto = createHandlerFeedback(db, logger, 'correto');
const handlerModelo = createHandlerModelo(db);

const bot = createBot(
  env,
  logger,
  handlerTexto,
  handlerMidia,
  handlerNaoSuportado,
  handlerFeedback,
  handlerFeedbackCorreto,
  handlerModelo,
);

bot.start({
  onStart: () => {
    logger.info({ ambiente: env.ambiente }, 'bot iniciado (long polling)');
  },
});
