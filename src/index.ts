import { createOpenRouterClient } from './ai/openrouter.js';
import { createBot } from './bot/bot.js';
import { COMANDOS_BOT } from './bot/comandos.js';
import { createHandlerFeedback } from './bot/handlers/feedback.js';
import { createHandlerMidia } from './bot/handlers/midia.js';
import { createHandlerModelo } from './bot/handlers/modelo.js';
import { createHandlerModelos } from './bot/handlers/modelos.js';
import { createHandlerNaoSuportado } from './bot/handlers/naoSuportado.js';
import { createHandlerCodigoOAuthGoogle, createHandlerRegistrarEmail } from './bot/handlers/registrarEmail.js';
import { createHandlerTexto } from './bot/handlers/texto.js';
import { createHandlerVoz } from './bot/handlers/voz.js';
import { loadEnv } from './config/env.js';
import { getDb } from './db/client.js';
import { migrate } from './db/migrate.js';
import { listarVencidas, removerAgendamento } from './db/repositories/mensagensPendentesApagar.js';
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
const handlerRegistrarEmail = createHandlerRegistrarEmail(env);
const handlerCodigoOAuthGoogle = createHandlerCodigoOAuthGoogle(db, logger);

const bot = createBot(
  env,
  logger,
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
);

// Achado real (2026-09-19): agendamento de auto-apagar (registrarEmail.ts)
// some se o bot reiniciar antes do setTimeout disparar (mesma classe do bug
// de confirmacao cross-processo, migration 0012) — varre o que ficou
// atrasado assim que o processo sobe, antes de aceitar updates.
async function apagarMensagensPendentesAtrasadas(): Promise<void> {
  for (const { chatId, messageId } of listarVencidas(db)) {
    try {
      await bot.api.deleteMessage(chatId, messageId);
    } catch (erro) {
      logger.error({ err: erro, chatId, messageId }, 'falha ao apagar mensagem pendente atrasada na subida do bot');
    }
    removerAgendamento(db, chatId, messageId);
  }
}

await apagarMensagensPendentesAtrasadas();

// Menu "/" do Telegram com autocomplete (filtra conforme digita) — mesma
// fonte (comandos.ts) usada pelo roteamento em router.ts, nunca dessincroniza.
await bot.api.setMyCommands(
  COMANDOS_BOT.map(({ comando, descricao }) => ({ command: comando, description: descricao })),
);

bot.start({
  onStart: () => {
    logger.info({ ambiente: env.ambiente }, 'bot iniciado (long polling)');
  },
});
