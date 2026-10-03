import { InputFile, type Context } from 'grammy';
import { extrairResultadoTool } from '../../ai/openrouter.js';
import type { ToolDefinition } from '../../ai/tools/types.js';
import type { DbClient } from '../../db/client.js';
import { obterPendenciaPersistida, removerPendenciaPersistida } from '../../db/repositories/confirmacoesPendentes.js';
import { obterIdioma } from '../../db/repositories/idiomaBot.js';
import { t } from '../../i18n/t.js';
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

    const idioma = obterIdioma(db);
    const pendencia = obterPendencia(chatId);
    const pendenciaPersistida = pendencia ? undefined : obterPendenciaPersistida(db, chatId);

    if (!pendencia && !pendenciaPersistida) {
      await ctx.answerCallbackQuery({ text: t('callback_expirado', idioma) });
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      return;
    }

    if (pendencia) removerPendencia(chatId);
    if (pendenciaPersistida) removerPendenciaPersistida(db, chatId);

    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);

    if (dados !== CALLBACK_DATA_CONFIRMAR) {
      await ctx.reply(t('acao_cancelada', idioma));
      return;
    }

    const tool = pendencia?.tool ?? tools.find((tl) => tl.name === pendenciaPersistida?.toolName);
    const argumentos = pendencia?.argumentos ?? pendenciaPersistida?.argumentos;

    if (!tool) {
      logger.error(
        { toolName: pendenciaPersistida?.toolName },
        'callback de confirmação referencia tool desconhecida',
      );
      await ctx.reply(t('nao_consegui_concluir_acao', idioma));
      return;
    }

    try {
      const resultado = await tool.handler(argumentos, { chatId });
      const { texto, imagem, documento } = extrairResultadoTool(resultado);
      await ctx.reply(texto);
      if (imagem) await ctx.replyWithPhoto(new InputFile(imagem));
      if (documento) await ctx.replyWithDocument(new InputFile(documento.buffer, documento.nomeArquivo));
    } catch (erro) {
      logger.error({ err: erro }, 'falha ao executar ação confirmada pelo usuário (botão)');
      await ctx.reply(t('nao_consegui_concluir_acao', idioma));
    }
  };
}
