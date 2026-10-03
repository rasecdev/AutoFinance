import { createOpenRouterClient } from './ai/openrouter.js';
import { montarToolsConversa } from './ai/tools/conversaTools.js';
import { createBot } from './bot/bot.js';
import { COMANDOS_BOT } from './bot/comandos.js';
import { createHandlerAjuda } from './bot/handlers/ajuda.js';
import { createHandlerCallbackConfirmacao } from './bot/handlers/callbackConfirmacao.js';
import { createHandlerFeedback } from './bot/handlers/feedback.js';
import { createHandlerMidia } from './bot/handlers/midia.js';
import { createHandlerModelo } from './bot/handlers/modelo.js';
import { createHandlerModelos } from './bot/handlers/modelos.js';
import { createHandlerNaoSuportado } from './bot/handlers/naoSuportado.js';
import { createHandlerPausar } from './bot/handlers/pausar.js';
import { createHandlerRetomar } from './bot/handlers/retomar.js';
import { createHandlerCodigoOAuthGoogle, createHandlerRegistrarEmail } from './bot/handlers/registrarEmail.js';
import { iniciarLembreteReautorizacaoGoogle } from './bot/lembreteReautorizacaoGoogle.js';
import {
  createHandlerMapeamentoOpenFinance,
  createHandlerRegistrarOpenFinance,
} from './bot/handlers/registrarOpenFinance.js';
import { createHandlerTexto } from './bot/handlers/texto.js';
import { createHandlerVoz } from './bot/handlers/voz.js';
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
const handlerMidia = createHandlerMidia(openRouterClient, db, logger, env.telegramBotToken);
const handlerVoz = createHandlerVoz(openRouterClient, db, logger, env.telegramBotToken);
const handlerNaoSuportado = createHandlerNaoSuportado(logger);
const handlerFeedback = createHandlerFeedback(db, logger, 'incorreto');
const handlerFeedbackCorreto = createHandlerFeedback(db, logger, 'correto');
const handlerModelo = createHandlerModelo(db);
const handlerModelos = createHandlerModelos(db);
const handlerRegistrarEmail = createHandlerRegistrarEmail(env, db);
const handlerCodigoOAuthGoogle = createHandlerCodigoOAuthGoogle(db, logger);
const handlerAjuda = createHandlerAjuda();
const handlerRegistrarOpenFinance = createHandlerRegistrarOpenFinance(env, logger);
const handlerMapeamentoOpenFinance = createHandlerMapeamentoOpenFinance(db, logger);
const handlerCallbackConfirmacao = createHandlerCallbackConfirmacao(db, logger, montarToolsConversa(db, openRouterClient));
const handlerPausar = createHandlerPausar(db);
const handlerRetomar = createHandlerRetomar(db);

const bot = createBot(
  env,
  logger,
  db,
  handlerTexto,
  handlerMidia,
  handlerVoz,
  handlerNaoSuportado,
  handlerFeedback,
  handlerFeedbackCorreto,
  handlerModelo,
  handlerModelos,
  handlerRegistrarEmail,
  handlerCodigoOAuthGoogle,
  handlerAjuda,
  handlerRegistrarOpenFinance,
  handlerMapeamentoOpenFinance,
  handlerCallbackConfirmacao,
  handlerPausar,
  handlerRetomar,
);

// Menu "/" do Telegram com autocomplete (filtra conforme digita) — mesma
// fonte (comandos.ts) usada pelo roteamento em router.ts, nunca dessincroniza.
await bot.api.setMyCommands(
  COMANDOS_BOT.map(({ comando, descricao }) => ({ command: comando, description: descricao })),
);

iniciarLembreteReautorizacaoGoogle(bot, env, db, logger);

bot.start({
  onStart: () => {
    logger.info({ ambiente: env.ambiente }, 'bot iniciado (long polling)');
  },
});
