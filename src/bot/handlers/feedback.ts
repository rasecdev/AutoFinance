import type { Context } from 'grammy';
import type { DbClient } from '../../db/client.js';
import { obterIdioma } from '../../db/repositories/idiomaBot.js';
import { atualizarAvaliacaoInteracao, type AvaliacaoUsuario } from '../../db/repositories/interacoesIa.js';
import { t } from '../../i18n/t.js';
import type { Logger } from '../../logging/logger.js';
import { obterTraceIdPorMensagem } from '../rastroRespostas.js';

function comandoPara(avaliacao: AvaliacaoUsuario): string {
  return avaliacao === 'correto' ? '/certo' : '/errado';
}

export function createHandlerFeedback(db: DbClient, logger: Logger, avaliacao: AvaliacaoUsuario) {
  const comando = comandoPara(avaliacao);
  const chaveAvaliacao = avaliacao === 'correto' ? 'avaliacao_correto' : 'avaliacao_incorreto';

  return async function handlerFeedback(ctx: Context): Promise<void> {
    const idioma = obterIdioma(db);
    const avaliacaoLocalizada = t(chaveAvaliacao, idioma);

    const mensagemRespondida = ctx.message?.reply_to_message;
    if (mensagemRespondida === undefined) {
      await ctx.reply(t('feedback_sem_reply', idioma, { avaliacao: avaliacaoLocalizada, comando }));
      return;
    }

    const traceId = obterTraceIdPorMensagem(mensagemRespondida.message_id);
    if (traceId === undefined) {
      await ctx.reply(t('feedback_nao_encontrada', idioma));
      return;
    }

    const atualizado = atualizarAvaliacaoInteracao(db, traceId, avaliacao);
    if (!atualizado) {
      logger.warn({ traceId }, 'trace_id rastreado mas não encontrado em interacoes_ia');
      await ctx.reply(t('feedback_nao_encontrada', idioma));
      return;
    }

    await ctx.reply(t('feedback_marcada', idioma, { avaliacao: avaliacaoLocalizada }));
  };
}
