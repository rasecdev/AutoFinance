import type { Context } from 'grammy';
import { criarContextoTelegram, type CanalContext } from '../../canais/contextoCanal.js';
import type { DbClient } from '../../db/client.js';
import { obterIdioma } from '../../db/repositories/idiomaBot.js';
import { t } from '../../i18n/t.js';
import { definirModeloAtivo, resolverModeloConversa } from '../../ai/roteamento/modeloAtivo.js';

// Núcleo reaproveitado pelo handler do Telegram e pelo roteamento do webhook
// do WhatsApp (Fase 9 Rodada 3, Tarefa 141) — só depende da interface mínima
// (CanalContext, Tarefa 130), nunca do Context largo do grammy.
export async function processarModelo(
  ctx: CanalContext,
  db: DbClient,
  chatId: number | string,
  texto: string,
): Promise<void> {
  const idioma = obterIdioma(db);
  const nomeModelo = texto.replace(/^\/modelo\s*/i, '').trim();

  if (nomeModelo.length === 0) {
    await ctx.reply(t('modelo_ativo_chat', idioma, { modelo: resolverModeloConversa(db, chatId) }));
    return;
  }

  definirModeloAtivo(chatId, nomeModelo);
  await ctx.reply(t('modelo_trocado', idioma, { nome: nomeModelo }));
}

export function createHandlerModelo(db: DbClient) {
  return async function handlerModelo(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const texto = ctx.message?.text;

    if (chatId === undefined || texto === undefined) {
      return;
    }

    await processarModelo(criarContextoTelegram(ctx), db, chatId, texto);
  };
}
