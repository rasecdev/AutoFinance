import type { Context } from 'grammy';
import { criarContextoTelegram, type CanalContext } from '../../canais/contextoCanal.js';
import type { DbClient } from '../../db/client.js';
import { definirIdioma, obterIdioma, type Idioma } from '../../db/repositories/idiomaBot.js';
import { t } from '../../i18n/t.js';
import { COMANDOS_BOT, descricaoComando } from '../comandos.js';

const IDIOMAS_VALIDOS: readonly Idioma[] = ['pt', 'en', 'es'];

function ehIdiomaValido(valor: string): valor is Idioma {
  return (IDIOMAS_VALIDOS as readonly string[]).includes(valor);
}

// Núcleo reaproveitado pelo handler do Telegram e pelo roteamento do webhook
// do WhatsApp (Fase 9 Rodada 3, Tarefa 142) — só depende da interface mínima
// (CanalContext, Tarefa 130), nunca do Context largo do grammy. Devolve o
// idioma novo quando de fato trocou (único caso em que o menu "/" do
// Telegram precisa ser atualizado) — `setMyCommands` fica fora daqui de
// propósito: não existe equivalente no WhatsApp, e CanalContext não declara
// esse método (chamar por engano aqui vira erro de compilação, não bug
// silencioso em runtime).
export async function processarIdioma(
  ctx: CanalContext,
  db: DbClient,
  texto: string,
): Promise<Idioma | undefined> {
  const valor = texto.replace(/^\/idioma\s*/i, '').trim().toLowerCase();
  const idiomaAtual = obterIdioma(db);

  if (valor.length === 0) {
    await ctx.reply(t('idioma_atual', idiomaAtual));
    return undefined;
  }

  if (!ehIdiomaValido(valor)) {
    await ctx.reply(t('idioma_invalido', idiomaAtual, { valor }));
    return undefined;
  }

  definirIdioma(db, valor);
  await ctx.reply(t('idioma_confirmacao', valor));
  return valor;
}

export function createHandlerIdioma(db: DbClient) {
  return async function handlerIdioma(ctx: Context): Promise<void> {
    const texto = ctx.message?.text;
    if (texto === undefined) {
      return;
    }

    const idiomaNovo = await processarIdioma(criarContextoTelegram(ctx), db, texto);
    if (idiomaNovo === undefined) {
      return;
    }

    await ctx.api.setMyCommands(
      COMANDOS_BOT.map((cmd) => ({ command: cmd.comando, description: descricaoComando(cmd, idiomaNovo) })),
    );
  };
}
