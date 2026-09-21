import { InputFile, type Context } from 'grammy';
import { extrairTextoEImagem } from '../../ai/openrouter.js';
import type { ToolDefinition } from '../../ai/tools/types.js';
import type { DbClient } from '../../db/client.js';
import { obterPendenciaPersistida, removerPendenciaPersistida } from '../../db/repositories/confirmacoesPendentes.js';
import type { Logger } from '../../logging/logger.js';
import { CALLBACK_DATA_CONFIRMAR, obterPendencia, removerPendencia } from '../confirmacao.js';

// Segunda forma de responder à pergunta de confirmação, além de digitar
// "sim"/qualquer coisa em texto.ts — mesmas duas fontes de pendência (Map em
// memória de confirmacao.ts e a tabela confirmacoes_pendentes, pra pendência
// gravada por um processo separado como lerEmailFaturas.ts). Sempre remove o
// teclado da mensagem original depois do clique, pra não dar pra confirmar
// duas vezes.
export function createHandlerCallbackConfirmacao(db: DbClient, logger: Logger, tools: ToolDefinition[]) {
  return async function handlerCallbackConfirmacao(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const dados = ctx.callbackQuery?.data;
    if (chatId === undefined || dados === undefined) {
      return;
    }

    const pendencia = obterPendencia(chatId);
    const pendenciaPersistida = pendencia ? undefined : obterPendenciaPersistida(db, chatId);

    if (!pendencia && !pendenciaPersistida) {
      await ctx.answerCallbackQuery({ text: 'Isso já foi respondido ou expirou.' });
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      return;
    }

    if (pendencia) removerPendencia(chatId);
    if (pendenciaPersistida) removerPendenciaPersistida(db, chatId);

    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);

    if (dados !== CALLBACK_DATA_CONFIRMAR) {
      await ctx.reply('Ação cancelada.');
      return;
    }

    const tool = pendencia?.tool ?? tools.find((t) => t.name === pendenciaPersistida?.toolName);
    const argumentos = pendencia?.argumentos ?? pendenciaPersistida?.argumentos;

    if (!tool) {
      logger.error(
        { toolName: pendenciaPersistida?.toolName },
        'callback de confirmação referencia tool desconhecida',
      );
      await ctx.reply('Não consegui concluir a ação confirmada, tente novamente.');
      return;
    }

    try {
      const resultado = await tool.handler(argumentos, { chatId });
      const { texto, imagem } = extrairTextoEImagem(resultado);
      await ctx.reply(texto);
      if (imagem) await ctx.replyWithPhoto(new InputFile(imagem));
    } catch (erro) {
      logger.error({ err: erro }, 'falha ao executar ação confirmada pelo usuário (botão)');
      await ctx.reply('Não consegui concluir a ação confirmada, tente novamente.');
    }
  };
}
