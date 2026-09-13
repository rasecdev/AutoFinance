import type { Context } from 'grammy';
import type OpenAI from 'openai';
import { resolverModeloTranscricaoVoz, transcreverAudio, FLUXO_TRANSCRICAO_VOZ } from '../../ai/transcricao.js';
import { montarToolsConversa } from '../../ai/tools/conversaTools.js';
import type { DbClient } from '../../db/client.js';
import { registrarUsoTokens } from '../../db/repositories/usoTokens.js';
import type { Logger } from '../../logging/logger.js';
import { processarMensagemTexto } from './texto.js';

const MENSAGEM_ERRO_TRANSCRICAO =
  'Não consegui entender o áudio, tenta de novo ou manda por texto.';

async function baixarArquivo(ctx: Context, botToken: string): Promise<Buffer> {
  const arquivo = await ctx.getFile();
  const url = `https://api.telegram.org/file/bot${botToken}/${arquivo.file_path}`;
  const resposta = await fetch(url);
  const bytes = await resposta.arrayBuffer();
  return Buffer.from(bytes);
}

export function createHandlerVoz(client: OpenAI, db: DbClient, logger: Logger, botToken: string) {
  const tools = montarToolsConversa(db, client);

  return async function handlerVoz(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;

    const log = logger.child({ chatId });

    let textoTranscrito: string;
    try {
      const buffer = await baixarArquivo(ctx, botToken);
      const modelo = resolverModeloTranscricaoVoz(db);
      const { texto, custoEstimado } = await transcreverAudio(client, buffer, 'voz.ogg', modelo);

      registrarUsoTokens(db, {
        fluxo: FLUXO_TRANSCRICAO_VOZ,
        modelo,
        tokensPrompt: 0,
        tokensCompletion: 0,
        custoEstimado,
        origem: 'uso_real',
      });

      textoTranscrito = texto;
    } catch (erro) {
      log.error({ err: erro }, 'falha ao transcrever áudio');
      await ctx.reply(MENSAGEM_ERRO_TRANSCRICAO);
      return;
    }

    if (textoTranscrito.trim().length === 0) {
      await ctx.reply(MENSAGEM_ERRO_TRANSCRICAO);
      return;
    }

    await processarMensagemTexto(ctx, db, client, logger, tools, textoTranscrito, chatId);
  };
}
