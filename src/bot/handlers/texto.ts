import { randomUUID } from 'node:crypto';
import type { Context } from 'grammy';
import type OpenAI from 'openai';
import { gerarResposta, MODELO_PADRAO } from '../../ai/openrouter.js';
import type { DbClient } from '../../db/client.js';
import { registrarInteracaoIa } from '../../db/repositories/interacoesIa.js';
import { registrarUsoTokens } from '../../db/repositories/usoTokens.js';
import type { Logger } from '../../logging/logger.js';

const FLUXO = 'conversa_texto';

export function createHandlerTexto(client: OpenAI, db: DbClient, logger: Logger) {
  return async function handlerTexto(ctx: Context): Promise<void> {
    const mensagemUsuario = ctx.message?.text;

    if (mensagemUsuario === undefined) {
      return;
    }

    const traceId = randomUUID();
    const log = logger.child({ traceId });

    try {
      const { modelo, resposta, toolCalls, tokensPrompt, tokensCompletion } = await gerarResposta(
        client,
        mensagemUsuario,
      );

      registrarInteracaoIa(db, {
        traceId,
        fluxo: FLUXO,
        modelo,
        mensagemUsuario,
        respostaModelo: resposta,
        toolCalls,
        resultado: 'sucesso',
      });

      // custo_estimado fica 0 até a Fase 5 (monitoramento de preço/roteamento)
      // existir uma fonte real de preço por modelo pra calcular em cima.
      registrarUsoTokens(db, {
        fluxo: FLUXO,
        modelo,
        tokensPrompt,
        tokensCompletion,
        custoEstimado: 0,
        origem: 'uso_real',
      });

      log.info({ modelo, tokensPrompt, tokensCompletion }, 'interação com IA registrada');
      await ctx.reply(resposta);
    } catch (erro) {
      registrarInteracaoIa(db, {
        traceId,
        fluxo: FLUXO,
        modelo: MODELO_PADRAO,
        mensagemUsuario,
        resultado: 'erro',
      });

      log.error({ err: erro }, 'falha ao chamar OpenRouter');
      await ctx.reply('Não consegui processar sua mensagem agora, tente de novo em instantes.');
    }
  };
}
