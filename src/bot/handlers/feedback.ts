import type { Context } from 'grammy';
import type { DbClient } from '../../db/client.js';
import { atualizarAvaliacaoInteracao } from '../../db/repositories/interacoesIa.js';
import type { Logger } from '../../logging/logger.js';
import { obterTraceIdPorMensagem } from '../rastroRespostas.js';

const SEM_REPLY =
  'Pra marcar uma resposta como incorreta, responda (reply) diretamente à mensagem do bot que você quer marcar, com /errado.';
const NAO_ENCONTRADA =
  'Não encontrei o registro dessa resposta (pode ter sido antes do bot reiniciar). Não dá pra marcar como incorreta.';
const MARCADA = 'Marcado como incorreto. Obrigado pelo feedback.';

export function createHandlerFeedback(db: DbClient, logger: Logger) {
  return async function handlerFeedback(ctx: Context): Promise<void> {
    const mensagemRespondida = ctx.message?.reply_to_message;
    if (mensagemRespondida === undefined) {
      await ctx.reply(SEM_REPLY);
      return;
    }

    const traceId = obterTraceIdPorMensagem(mensagemRespondida.message_id);
    if (traceId === undefined) {
      await ctx.reply(NAO_ENCONTRADA);
      return;
    }

    const atualizado = atualizarAvaliacaoInteracao(db, traceId, 'incorreto');
    if (!atualizado) {
      logger.warn({ traceId }, 'trace_id rastreado mas não encontrado em interacoes_ia');
      await ctx.reply(NAO_ENCONTRADA);
      return;
    }

    await ctx.reply(MARCADA);
  };
}
