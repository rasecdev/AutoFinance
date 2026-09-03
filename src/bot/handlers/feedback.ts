import type { Context } from 'grammy';
import type { DbClient } from '../../db/client.js';
import { atualizarAvaliacaoInteracao, type AvaliacaoUsuario } from '../../db/repositories/interacoesIa.js';
import type { Logger } from '../../logging/logger.js';
import { obterTraceIdPorMensagem } from '../rastroRespostas.js';

const NAO_ENCONTRADA =
  'Não encontrei o registro dessa resposta (pode ter sido antes do bot reiniciar). Não dá pra marcar.';

function comandoPara(avaliacao: AvaliacaoUsuario): string {
  return avaliacao === 'correto' ? '/certo' : '/errado';
}

export function createHandlerFeedback(db: DbClient, logger: Logger, avaliacao: AvaliacaoUsuario) {
  const comando = comandoPara(avaliacao);
  const semReply = `Pra marcar uma resposta como ${avaliacao}, responda (reply) diretamente à mensagem do bot que você quer marcar, com ${comando}.`;
  const marcada = `Marcado como ${avaliacao}. Obrigado pelo feedback.`;

  return async function handlerFeedback(ctx: Context): Promise<void> {
    const mensagemRespondida = ctx.message?.reply_to_message;
    if (mensagemRespondida === undefined) {
      await ctx.reply(semReply);
      return;
    }

    const traceId = obterTraceIdPorMensagem(mensagemRespondida.message_id);
    if (traceId === undefined) {
      await ctx.reply(NAO_ENCONTRADA);
      return;
    }

    const atualizado = atualizarAvaliacaoInteracao(db, traceId, avaliacao);
    if (!atualizado) {
      logger.warn({ traceId }, 'trace_id rastreado mas não encontrado em interacoes_ia');
      await ctx.reply(NAO_ENCONTRADA);
      return;
    }

    await ctx.reply(marcada);
  };
}
