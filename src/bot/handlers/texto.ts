import { randomUUID } from 'node:crypto';
import { InputFile, type Context } from 'grammy';
import type OpenAI from 'openai';
import { montarHistorico } from '../../ai/contexto.js';
import { extrairTextoEImagem, gerarResposta, MODELO_PADRAO } from '../../ai/openrouter.js';
import { verificarGatilhoResumo } from '../../ai/resumirContexto.js';
import { montarToolsConversa } from '../../ai/tools/conversaTools.js';
import type { ToolDefinition } from '../../ai/tools/types.js';
import type { DbClient } from '../../db/client.js';
import {
  obterPendenciaPersistida,
  removerPendenciaPersistida,
} from '../../db/repositories/confirmacoesPendentes.js';
import { registrarInteracaoIa } from '../../db/repositories/interacoesIa.js';
import { registrarUsoTokens } from '../../db/repositories/usoTokens.js';
import type { Logger } from '../../logging/logger.js';
import {
  definirPendencia,
  ehConfirmacaoAfirmativa,
  montarTecladoConfirmacao,
  obterPendencia,
  removerPendencia,
} from '../confirmacao.js';
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

// Telegram expira o indicador de "digitando..." em ~5s — reenvia periodicamente
// enquanto a chamada de IA (ou ação confirmada) roda, pra sinalizar que o bot
// está processando até responder de fato.
const INTERVALO_LOADER_MS = 4000;

async function comIndicadorDigitando<T>(ctx: Context, tarefa: Promise<T>, logger: Logger): Promise<T> {
  const enviarIndicador = () => {
    void ctx.replyWithChatAction('typing').catch((erro: unknown) => {
      logger.warn({ err: erro }, 'falha ao enviar indicador de "digitando..."');
    });
  };

  enviarIndicador();
  const intervalo = setInterval(enviarIndicador, INTERVALO_LOADER_MS);

  try {
    return await tarefa;
  } finally {
    clearInterval(intervalo);
  }
}

// Núcleo do fluxo conversa_texto, extraído pra ser reaproveitado por qualquer
// handler que já tenha uma string de mensagem pronta — hoje texto.ts (direto
// do Telegram) e voz.ts (Fase 6 parte 11, texto vindo de transcrição), sem
// duplicar histórico/registro/resumo/tratamento de erro entre os dois.
export async function processarMensagemTexto(
  ctx: Context,
  db: DbClient,
  client: OpenAI,
  logger: Logger,
  tools: ToolDefinition[],
  mensagemUsuario: string,
  chatId: number,
): Promise<void> {
  const pendencia = obterPendencia(chatId);
  if (pendencia) {
    removerPendencia(chatId);

    if (!ehConfirmacaoAfirmativa(mensagemUsuario)) {
      await ctx.reply('Ação cancelada.');
      return;
    }

    try {
      const resultado = await comIndicadorDigitando(
        ctx,
        pendencia.tool.handler(pendencia.argumentos, { chatId }),
        logger,
      );
      const { texto, imagem } = extrairTextoEImagem(resultado);
      await ctx.reply(texto);
      if (imagem) await ctx.replyWithPhoto(new InputFile(imagem));
    } catch (erro) {
      logger.error({ err: erro }, 'falha ao executar ação confirmada pelo usuário');
      await ctx.reply('Não consegui concluir a ação confirmada, tente novamente.');
    }
    return;
  }

  // Pendência gravada por um processo separado do bot (ex: lerEmailFaturas.ts,
  // Fase 7) — o Map em memória de confirmacao.ts não existe nesse outro
  // processo, então essas pendências vêm do banco (achado real de teste
  // manual, ver migration 0012). Reconstrói a tool a partir do nome porque só
  // dado serializável (nome + argumentos) atravessa processos, nunca a
  // função handler em si.
  const pendenciaPersistida = obterPendenciaPersistida(db, chatId);
  if (pendenciaPersistida) {
    removerPendenciaPersistida(db, chatId);

    if (!ehConfirmacaoAfirmativa(mensagemUsuario)) {
      await ctx.reply('Ação cancelada.');
      return;
    }

    const tool = tools.find((t) => t.name === pendenciaPersistida.toolName);
    if (!tool) {
      logger.error({ toolName: pendenciaPersistida.toolName }, 'pendência persistida referencia tool desconhecida');
      await ctx.reply('Não consegui concluir a ação confirmada, tente novamente.');
      return;
    }

    try {
      const resultado = await comIndicadorDigitando(
        ctx,
        tool.handler(pendenciaPersistida.argumentos, { chatId }),
        logger,
      );
      const { texto, imagem } = extrairTextoEImagem(resultado);
      await ctx.reply(texto);
      if (imagem) await ctx.replyWithPhoto(new InputFile(imagem));
    } catch (erro) {
      logger.error({ err: erro }, 'falha ao executar ação confirmada pelo usuário (pendência persistida)');
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
      imagens,
      tokensPrompt,
      tokensCompletion,
      cachedTokens,
      cacheWriteTokens,
      custoReal,
      duracaoMs,
      pendenciaConfirmacao,
    } = await comIndicadorDigitando(
      ctx,
      gerarResposta(client, mensagemUsuario, tools, { chatId }, historico, resolverModeloConversa(db, chatId)),
      log,
    );

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

    registrarUsoTokens(db, {
      fluxo: FLUXO,
      modelo,
      tokensPrompt,
      tokensCompletion,
      custoEstimado: custoReal,
      origem: 'uso_real',
    });

    log.info(
      { modelo, tokensPrompt, tokensCompletion, cachedTokens, cacheWriteTokens, duracaoMs },
      'interação com IA registrada',
    );
    const mensagemEnviada = await ctx.reply(
      resposta.trim().length > 0 ? resposta : 'Não entendi, pode reformular?',
      pendenciaConfirmacao ? { reply_markup: montarTecladoConfirmacao() } : undefined,
    );
    definirRastroResposta(mensagemEnviada.message_id, traceId);
    for (const imagem of imagens) {
      await ctx.replyWithPhoto(new InputFile(imagem));
    }

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
}

export function createHandlerTexto(client: OpenAI, db: DbClient, logger: Logger) {
  const tools = montarToolsConversa(db, client);

  return async function handlerTexto(ctx: Context): Promise<void> {
    const mensagemUsuario = ctx.message?.text;
    const chatId = ctx.chat?.id;

    if (mensagemUsuario === undefined || chatId === undefined) {
      return;
    }

    await processarMensagemTexto(ctx, db, client, logger, tools, mensagemUsuario, chatId);
  };
}
