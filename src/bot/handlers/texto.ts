import { randomUUID } from 'node:crypto';
import type { Context } from 'grammy';
import type OpenAI from 'openai';
import { montarHistorico } from '../../ai/contexto.js';
import { gerarResposta, MODELO_PADRAO } from '../../ai/openrouter.js';
import { verificarGatilhoResumo } from '../../ai/resumirContexto.js';
import { criarToolCriarCartao, criarToolCriarConta } from '../../ai/tools/contas.js';
import {
  criarToolConsultarSaldo,
  criarToolConsultarExtrato,
  criarToolResumoMensal,
} from '../../ai/tools/consultas.js';
import {
  criarToolEditarTransacao,
  criarToolExcluirTransacao,
  criarToolRegistrarTransacao,
} from '../../ai/tools/transacoes.js';
import { criarToolRegistrarTransferencia } from '../../ai/tools/transferencias.js';
import {
  criarToolAmortizarDivida,
  criarToolCriarDivida,
  criarToolQuitarDivida,
  criarToolRenegociar,
} from '../../ai/tools/dividas.js';
import { criarToolPagarFatura, criarToolPagarParcela } from '../../ai/tools/pagamentos.js';
import {
  criarToolConsultarDividasAtivas,
  criarToolConsultarFatura,
  criarToolResumoDividas,
} from '../../ai/tools/consultasDividas.js';
import { criarToolCriarDespesaFixa, criarToolEditarDespesaFixa } from '../../ai/tools/despesasFixas.js';
import type { DbClient } from '../../db/client.js';
import { registrarInteracaoIa } from '../../db/repositories/interacoesIa.js';
import { registrarUsoTokens } from '../../db/repositories/usoTokens.js';
import type { Logger } from '../../logging/logger.js';
import { definirPendencia, ehConfirmacaoAfirmativa, obterPendencia, removerPendencia } from '../confirmacao.js';
import { resolverModeloConversa } from '../modeloAtivo.js';
import { definirRastroResposta } from '../rastroRespostas.js';

const FLUXO = 'conversa_texto';

// Achado real de teste manual: /modelo não valida o nome contra a lista do
// OpenRouter (decisão do PLANO.md, item da Tarefa 21) — quando o usuário digita
// o nome de exibição em vez do slug (ex: "GPT-5 Nano" em vez de "openai/gpt-5-nano"),
// o erro genérico de "tente de novo" não deixa claro o motivo. A API do OpenRouter
// devolve 400 nesse caso — detectar isso especificamente pra dar uma dica acionável.
function ehErroModeloInvalido(erro: unknown): boolean {
  return typeof erro === 'object' && erro !== null && 'status' in erro && erro.status === 400;
}

export function createHandlerTexto(client: OpenAI, db: DbClient, logger: Logger) {
  const tools = [
    criarToolCriarConta(db),
    criarToolCriarCartao(db),
    criarToolRegistrarTransacao(db),
    criarToolEditarTransacao(db),
    criarToolExcluirTransacao(db),
    criarToolConsultarSaldo(db),
    criarToolConsultarExtrato(db),
    criarToolResumoMensal(db),
    criarToolRegistrarTransferencia(db),
    criarToolCriarDivida(db),
    criarToolRenegociar(db),
    criarToolPagarParcela(db),
    criarToolPagarFatura(db),
    criarToolQuitarDivida(db),
    criarToolAmortizarDivida(db),
    criarToolConsultarFatura(db),
    criarToolConsultarDividasAtivas(db),
    criarToolResumoDividas(db),
    criarToolCriarDespesaFixa(db),
    criarToolEditarDespesaFixa(db),
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
      const historico = montarHistorico(db, chatId);
      const {
        modelo,
        resposta,
        toolCalls,
        tokensPrompt,
        tokensCompletion,
        cachedTokens,
        cacheWriteTokens,
        duracaoMs,
        pendenciaConfirmacao,
      } = await gerarResposta(client, mensagemUsuario, tools, { chatId }, historico, resolverModeloConversa(db, chatId));

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
        chatId,
        tokensPrompt,
        tokensCompletion,
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

      log.info(
        { modelo, tokensPrompt, tokensCompletion, cachedTokens, cacheWriteTokens, duracaoMs },
        'interação com IA registrada',
      );
      const mensagemEnviada = await ctx.reply(
        resposta.trim().length > 0 ? resposta : 'Não entendi, pode reformular?',
      );
      definirRastroResposta(mensagemEnviada.message_id, traceId);

      // Roda depois de a resposta já ter sido enviada — não adiciona latência
      // perceptível à resposta atual (PLANO.md, mecanismo de resumo cumulativo).
      try {
        await verificarGatilhoResumo(db, client, chatId);
      } catch (erroResumo) {
        log.error({ err: erroResumo }, 'falha ao gerar resumo de contexto');
      }
    } catch (erro) {
      registrarInteracaoIa(db, {
        traceId,
        fluxo: FLUXO,
        modelo: MODELO_PADRAO,
        mensagemUsuario,
        resultado: 'erro',
        chatId,
      });

      log.error({ err: erro }, 'falha ao chamar OpenRouter');
      await ctx.reply(
        ehErroModeloInvalido(erro)
          ? 'Não consegui usar o modelo configurado nesse chat — o OpenRouter recusou, provavelmente porque o nome não é um slug válido. Confira com /modelo, ou troque de novo usando o slug do OpenRouter (ex: "openai/gpt-4o-mini", "qwen/qwen3-32b"), não o nome de exibição.'
          : 'Não consegui processar sua mensagem agora, tente de novo em instantes.',
      );
    }
  };
}
