import type { Context } from 'grammy';
import type OpenAI from 'openai';
import {
  extrairComprovante,
  FLUXO_LEITURA_COMPROVANTE,
  resolverModeloLeituraComprovante,
  type ResultadoExtracaoComprovante,
} from '../../ai/extracaoComprovante.js';
import { exigirConfirmacaoDeRegistro, montarToolsConversa } from '../../ai/tools/conversaTools.js';
import type { DbClient } from '../../db/client.js';
import { registrarUsoTokens } from '../../db/repositories/usoTokens.js';
import type { Logger } from '../../logging/logger.js';
import { processarMensagemTexto } from './texto.js';

const MENSAGEM_NAO_COMPROVANTE =
  'Não consegui reconhecer essa imagem como um comprovante financeiro. Manda uma foto nítida do comprovante, ou registra por texto/voz mesmo.';
const MENSAGEM_FATURA_BOLETO =
  'Isso parece ser uma fatura de cartão ou boleto de dívida, não um comprovante de compra do dia a dia — ainda não trato esse tipo de documento automaticamente. Se for uma compra, manda o comprovante da compra em si.';
const MENSAGEM_TIPO_NAO_SUPORTADO = 'Esse tipo de arquivo ainda não é suportado — manda uma foto do comprovante.';
const MENSAGEM_PDF_NAO_SUPORTADO = 'Ainda não consigo ler PDF, manda como foto.';
const MENSAGEM_ERRO_EXTRACAO = 'Não consegui processar essa imagem agora, tente de novo em instantes.';

async function baixarArquivo(ctx: Context, botToken: string): Promise<Buffer> {
  const arquivo = await ctx.getFile();
  const url = `https://api.telegram.org/file/bot${botToken}/${arquivo.file_path}`;
  const resposta = await fetch(url);
  const bytes = await resposta.arrayBuffer();
  return Buffer.from(bytes);
}

// Fotos do Telegram chegam sempre como JPEG; documento com mime_type de
// imagem (ex: PNG enviado como arquivo, não como foto comprimida) ou PDF
// seguem o mesmo caminho de extração — PDF é tentado de verdade (Tarefa 82;
// se o provedor rejeitar o formato, o catch em handlerMidia degrada com
// MENSAGEM_PDF_NAO_SUPORTADO, distinta da mensagem genérica de erro).
function resolverMimeType(ctx: Context): { mimeType: string } | { tipoNaoSuportado: true } {
  if (ctx.message?.photo) {
    return { mimeType: 'image/jpeg' };
  }

  const mimeDocumento = ctx.message?.document?.mime_type;
  if (mimeDocumento?.startsWith('image/') || mimeDocumento === 'application/pdf') {
    return { mimeType: mimeDocumento };
  }
  return { tipoNaoSuportado: true };
}

// Mensagem sintética que alimenta o MESMO pipeline de conversa_texto (via
// processarMensagemTexto), como se o usuário tivesse digitado. O modelo
// segue as regras já existentes do SYSTEM_PROMPT sozinho (pergunta conta/
// cartão se não estiver claro) — a confirmação obrigatória antes de gravar
// vem de exigirConfirmacaoDeRegistro, não desta mensagem.
function montarMensagemSintetica(resultado: ResultadoExtracaoComprovante): string {
  const partes: string[] = [];
  if (resultado.valor !== undefined) partes.push(`R$ ${resultado.valor.toFixed(2)}`);
  if (resultado.categoriaSugerida !== undefined) partes.push(`categoria sugerida ${resultado.categoriaSugerida}`);
  if (resultado.descricao !== undefined) partes.push(`descrição "${resultado.descricao}"`);
  if (resultado.data !== undefined) partes.push(`data ${resultado.data}`);

  return `Comprovante lido: ${partes.join(', ')}. Registra essa despesa.`;
}

export function createHandlerMidia(client: OpenAI, db: DbClient, logger: Logger, botToken: string) {
  return async function handlerMidia(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;

    const log = logger.child({ chatId });

    const tipo = resolverMimeType(ctx);
    if ('tipoNaoSuportado' in tipo) {
      await ctx.reply(MENSAGEM_TIPO_NAO_SUPORTADO);
      return;
    }

    let resultado: ResultadoExtracaoComprovante;
    try {
      const buffer = await baixarArquivo(ctx, botToken);
      const modelo = resolverModeloLeituraComprovante(db);
      const extracao = await extrairComprovante(client, buffer, tipo.mimeType, modelo);
      resultado = extracao.resultado;

      registrarUsoTokens(db, {
        fluxo: FLUXO_LEITURA_COMPROVANTE,
        modelo,
        tokensPrompt: extracao.tokensPrompt,
        tokensCompletion: extracao.tokensCompletion,
        custoEstimado: extracao.custoReal,
        origem: 'uso_real',
      });
    } catch (erro) {
      log.error({ err: erro }, 'falha ao extrair dados do comprovante');
      // Achado a confirmar em teste manual (Tarefa 82): se o provedor rejeitar
      // PDF (formato ainda não aceito na chamada multimodal), a falha cai aqui
      // — mensagem específica de PDF em vez da genérica, sem tentar de novo.
      await ctx.reply(tipo.mimeType === 'application/pdf' ? MENSAGEM_PDF_NAO_SUPORTADO : MENSAGEM_ERRO_EXTRACAO);
      return;
    }

    if (!resultado.eComprovante) {
      await ctx.reply(MENSAGEM_NAO_COMPROVANTE);
      return;
    }

    if (resultado.tipoDocumento === 'fatura_cartao' || resultado.tipoDocumento === 'boleto_divida') {
      await ctx.reply(MENSAGEM_FATURA_BOLETO);
      return;
    }

    const mensagemSintetica = montarMensagemSintetica(resultado);
    const tools = exigirConfirmacaoDeRegistro(montarToolsConversa(db, client));
    await processarMensagemTexto(ctx, db, client, logger, tools, mensagemSintetica, chatId);
  };
}
