import type { Context } from 'grammy';
import { criarContextoTelegram, type CanalContext } from '../../canais/contextoCanal.js';
import type { DbClient } from '../../db/client.js';
import { estaPausado, retomar } from '../../db/repositories/botPausado.js';
import { obterIdioma } from '../../db/repositories/idiomaBot.js';
import { t } from '../../i18n/t.js';

// Núcleo reaproveitado pelo handler do Telegram e pelo roteamento do webhook
// do WhatsApp (Fase 9 Rodada 3, Tarefa 144) — só depende da interface mínima
// (CanalContext, Tarefa 130), nunca do Context largo do grammy.
export async function processarRetomar(ctx: CanalContext, db: DbClient, chatId: number | string): Promise<void> {
  const idioma = obterIdioma(db);
  const estavaPausado = estaPausado(db, chatId);
  retomar(db, chatId);

  await ctx.reply(t(estavaPausado ? 'bot_retomado' : 'bot_sem_pausa_ativa', idioma));
}

export function createHandlerRetomar(db: DbClient) {
  return async function handlerRetomar(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) {
      return;
    }

    await processarRetomar(criarContextoTelegram(ctx), db, chatId);
  };
}
