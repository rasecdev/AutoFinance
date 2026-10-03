import type { Context } from 'grammy';
import type { DbClient } from '../../db/client.js';
import { obterIdioma } from '../../db/repositories/idiomaBot.js';
import { t } from '../../i18n/t.js';
import { definirModeloAtivo, resolverModeloConversa } from '../modeloAtivo.js';

export function createHandlerModelo(db: DbClient) {
  return async function handlerModelo(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const texto = ctx.message?.text;

    if (chatId === undefined || texto === undefined) {
      return;
    }

    const idioma = obterIdioma(db);
    const nomeModelo = texto.replace(/^\/modelo\s*/i, '').trim();

    if (nomeModelo.length === 0) {
      await ctx.reply(t('modelo_ativo_chat', idioma, { modelo: resolverModeloConversa(db, chatId) }));
      return;
    }

    definirModeloAtivo(chatId, nomeModelo);
    await ctx.reply(t('modelo_trocado', idioma, { nome: nomeModelo }));
  };
}
