import type { Context, NextFunction } from 'grammy';
import type { DbClient } from '../../db/client.js';
import { estaPausado } from '../../db/repositories/botPausado.js';

// Regex dos dois comandos que sempre atravessam o kill switch (ASI10),
// mesmo com o chat pausado -- senão pausar seria uma via de mão única.
// Fonte única: comandos.ts (Tarefa 114) importa estas duas constantes em
// vez de duplicar o regex, pra nunca dessincronizar.
export const REGEX_PAUSAR = /^\/pausar\b/i;
export const REGEX_RETOMAR = /^\/retomar\b/i;

const MENSAGEM_PAUSADO = 'Bot pausado. Mande /retomar pra voltar a processar mensagens.';

// Roda logo depois da allowlist, antes de registerRoutes (bot.ts) -- único
// ponto de checagem do kill switch, em vez de duplicar em cada handler.
// Cobre tanto mensagem de texto/mídia/voz quanto clique em botão de
// confirmação (callback_query).
export function createPausaMiddleware(db: DbClient) {
  return async function pausaBot(ctx: Context, next: NextFunction): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined || !estaPausado(db, chatId)) {
      await next();
      return;
    }

    const texto = ctx.message?.text?.trim();
    if (texto !== undefined && (REGEX_PAUSAR.test(texto) || REGEX_RETOMAR.test(texto))) {
      await next();
      return;
    }

    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: MENSAGEM_PAUSADO, show_alert: true });
      return;
    }

    await ctx.reply(MENSAGEM_PAUSADO);
  };
}
