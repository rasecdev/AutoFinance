import { randomUUID } from 'node:crypto';
import type { Context } from 'grammy';
import type OpenAI from 'openai';
import { gerarResposta, MODELO_PADRAO } from '../../ai/openrouter.js';
import { criarToolCriarCartao, criarToolCriarConta } from '../../ai/tools/contas.js';
import {
  criarToolConsultarSaldo,
  criarToolListarTransacoes,
  criarToolResumoMensal,
} from '../../ai/tools/consultas.js';
import {
  criarToolEditarTransacao,
  criarToolExcluirTransacao,
  criarToolRegistrarTransacao,
} from '../../ai/tools/transacoes.js';
import { criarToolRegistrarTransferencia } from '../../ai/tools/transferencias.js';
import { criarToolCriarDivida, criarToolRenegociar } from '../../ai/tools/dividas.js';
import type { DbClient } from '../../db/client.js';
import { registrarInteracaoIa } from '../../db/repositories/interacoesIa.js';
import { registrarUsoTokens } from '../../db/repositories/usoTokens.js';
import type { Logger } from '../../logging/logger.js';
import { definirPendencia, ehConfirmacaoAfirmativa, obterPendencia, removerPendencia } from '../confirmacao.js';

const FLUXO = 'conversa_texto';

export function createHandlerTexto(client: OpenAI, db: DbClient, logger: Logger) {
  const tools = [
    criarToolCriarConta(db),
    criarToolCriarCartao(db),
    criarToolRegistrarTransacao(db),
    criarToolEditarTransacao(db),
    criarToolExcluirTransacao(db),
    criarToolConsultarSaldo(db),
    criarToolListarTransacoes(db),
    criarToolResumoMensal(db),
    criarToolRegistrarTransferencia(db),
    criarToolCriarDivida(db),
    criarToolRenegociar(db),
  ];

  return async function handlerTexto(ctx: Context): Promise<void> {
    const mensagemUsuario = ctx.message?.text;
    const chatId = ctx.chat?.id;

    if (mensagemUsuario === undefined || chatId === undefined) {
      return;
    }

    const pendencia = obterPendencia(chatId);
    if (pendencia) {
      removerPendencia(chatId);

      if (!ehConfirmacaoAfirmativa(mensagemUsuario)) {
        await ctx.reply('Ação cancelada.');
        return;
      }

      try {
        const resultado = await pendencia.tool.handler(pendencia.argumentos, { chatId });
        await ctx.reply(resultado);
      } catch (erro) {
        logger.error({ err: erro }, 'falha ao executar ação confirmada pelo usuário');
        await ctx.reply('Não consegui concluir a ação confirmada, tente novamente.');
      }
      return;
    }

    const traceId = randomUUID();
    const log = logger.child({ traceId });

    try {
      const { modelo, resposta, toolCalls, tokensPrompt, tokensCompletion, pendenciaConfirmacao } =
        await gerarResposta(client, mensagemUsuario, tools, { chatId });

      if (pendenciaConfirmacao) {
        definirPendencia(chatId, pendenciaConfirmacao);
      }

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
      await ctx.reply(resposta.trim().length > 0 ? resposta : 'Não entendi, pode reformular?');
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
