import type { Context } from 'grammy';
import { COMANDOS_BOT } from '../comandos.js';
import type { DbClient } from '../../db/client.js';
import { definirIdioma, obterIdioma, type Idioma } from '../../db/repositories/idiomaBot.js';
import { t } from '../../i18n/t.js';

const IDIOMAS_VALIDOS: readonly Idioma[] = ['pt', 'en', 'es'];

function ehIdiomaValido(valor: string): valor is Idioma {
  return (IDIOMAS_VALIDOS as readonly string[]).includes(valor);
}

// Fase 10 (i18n, ver PLANO.md/tasks/plan.md): idioma ativo é global por
// instância (sem chat_id), trocado só por este comando explícito. Depois de
// gravar, re-chama setMyCommands pra o menu "/" refletir o idioma novo (as
// descrições em si só passam a variar por idioma a partir da Tarefa 140).
export function createHandlerIdioma(db: DbClient) {
  return async function handlerIdioma(ctx: Context): Promise<void> {
    const texto = ctx.message?.text;
    if (texto === undefined) {
      return;
    }

    const valor = texto.replace(/^\/idioma\s*/i, '').trim().toLowerCase();
    const idiomaAtual = obterIdioma(db);

    if (valor.length === 0) {
      await ctx.reply(t('idioma_atual', idiomaAtual));
      return;
    }

    if (!ehIdiomaValido(valor)) {
      await ctx.reply(t('idioma_invalido', idiomaAtual, { valor }));
      return;
    }

    definirIdioma(db, valor);
    await ctx.reply(t('idioma_confirmacao', valor));
    await ctx.api.setMyCommands(COMANDOS_BOT.map(({ comando, descricao }) => ({ command: comando, description: descricao })));
  };
}
