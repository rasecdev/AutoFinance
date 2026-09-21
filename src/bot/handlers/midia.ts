import { randomUUID } from 'node:crypto';
import type { Context } from 'grammy';
import type OpenAI from 'openai';
import {
  extrairComprovante,
  FLUXO_LEITURA_COMPROVANTE,
  resolverModeloLeituraComprovante,
  type ResultadoExtracaoComprovante,
} from '../../ai/extracaoComprovante.js';
import {
  FLUXO_INTERPRETAR_PLANILHA,
  interpretarPlanilha,
  resolverModeloInterpretarPlanilha,
} from '../../ai/interpretacaoPlanilha.js';
import { exigirConfirmacaoDeRegistro, montarToolsConversa } from '../../ai/tools/conversaTools.js';
import { resolverCartaoId, resolverContaId } from '../../ai/tools/resolucao.js';
import { criarToolRegistrarTransacoesEmLote } from '../../ai/tools/transacoesEmLote.js';
import type { DbClient } from '../../db/client.js';
import { registrarInteracaoIa } from '../../db/repositories/interacoesIa.js';
import { registrarUsoTokens } from '../../db/repositories/usoTokens.js';
import type { Logger } from '../../logging/logger.js';
import { definirPendencia, montarTecladoConfirmacao } from '../confirmacao.js';
import { definirRastroResposta } from '../rastroRespostas.js';
import { processarMensagemTexto } from './texto.js';

const MENSAGEM_NAO_COMPROVANTE =
  'Não consegui reconhecer essa imagem como um comprovante financeiro. Manda uma foto nítida do comprovante, ou registra por texto/voz mesmo.';
const MENSAGEM_FATURA_BOLETO =
  'Isso parece ser uma fatura de cartão ou boleto de dívida, não um comprovante de compra do dia a dia — ainda não trato esse tipo de documento automaticamente. Se for uma compra, manda o comprovante da compra em si.';
const MENSAGEM_TIPO_NAO_SUPORTADO = 'Esse tipo de arquivo ainda não é suportado — manda uma foto do comprovante.';
const MENSAGEM_PDF_NAO_SUPORTADO = 'Ainda não consigo ler PDF, manda como foto.';
const MENSAGEM_ERRO_EXTRACAO = 'Não consegui processar essa imagem agora, tente de novo em instantes.';
const MENSAGEM_LEGENDA_NECESSARIA =
  'Pra ler uma planilha preciso saber a conta ou cartão — reenvia o arquivo com a legenda dizendo qual (ex: "conta corrente").';
const MENSAGEM_PLANILHA_SEM_TRANSACOES =
  'Não encontrei nenhuma transação reconhecível nessa planilha. Confira se as colunas fazem sentido (data, descrição, valor) e tenta de novo.';

const MIME_PLANILHA_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function baixarArquivo(ctx: Context, botToken: string): Promise<Buffer> {
  const arquivo = await ctx.getFile();
  const url = `https://api.telegram.org/file/bot${botToken}/${arquivo.file_path}`;
  const resposta = await fetch(url);
  const bytes = await resposta.arrayBuffer();
  return Buffer.from(bytes);
}

type TipoArquivo =
  | { tipo: 'comprovante'; mimeType: string }
  | { tipo: 'planilha' }
  | { tipo: 'nao_suportado' };

// Fotos do Telegram chegam sempre como JPEG; documento com mime_type de
// imagem (ex: PNG enviado como arquivo, não como foto comprimida) ou PDF
// seguem o caminho de comprovante (extração por visão). Planilha `.xlsx`
// segue um caminho totalmente diferente (parser estruturado, não visão —
// ver tasks/plan.md, parte 13). Só `.xlsx` é suportado nesta rodada.
function resolverTipoArquivo(ctx: Context): TipoArquivo {
  if (ctx.message?.photo) {
    return { tipo: 'comprovante', mimeType: 'image/jpeg' };
  }

  const mimeDocumento = ctx.message?.document?.mime_type;
  if (mimeDocumento === MIME_PLANILHA_XLSX) {
    return { tipo: 'planilha' };
  }
  if (mimeDocumento?.startsWith('image/') || mimeDocumento === 'application/pdf') {
    return { tipo: 'comprovante', mimeType: mimeDocumento };
  }
  return { tipo: 'nao_suportado' };
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

// Conta/cartão vem da legenda (caption) da mensagem, não de uma pergunta de
// acompanhamento — diferente do fluxo de comprovante, a leitura de planilha
// não passa pelo modelo de conversa_texto (ver próxima função), então não há
// "turno de modelo" pra perguntar sozinho (ver tasks/plan.md, parte 13).
function resolverContaOuCartaoDaLegenda(
  db: DbClient,
  legenda: string | undefined,
): { ok: true; contaId?: number; cartaoId?: number } | { ok: false } {
  if (legenda === undefined || legenda.trim().length === 0) {
    return { ok: false };
  }

  const resolucaoConta = resolverContaId(db, undefined, legenda);
  if (resolucaoConta.ok) {
    return { ok: true, contaId: resolucaoConta.id };
  }

  const resolucaoCartao = resolverCartaoId(db, undefined, legenda);
  if (resolucaoCartao.ok) {
    return { ok: true, cartaoId: resolucaoCartao.id };
  }

  return { ok: false };
}

// Diferente do comprovante (que deixa o modelo decidir chamar
// registrar_transacao), aqui já sabemos exatamente qual ação executar —
// fazer o modelo re-serializar uma lista grande numa chamada de tool é
// desnecessário e arriscado. A pendência é montada DIRETO, com uma mensagem
// de confirmação própria (resumo, não o JSON cru dos argumentos) — o
// mecanismo já existente em processarMensagemTexto cobre a execução.
async function processarPlanilha(
  ctx: Context,
  db: DbClient,
  client: OpenAI,
  logger: Logger,
  botToken: string,
  chatId: number,
): Promise<void> {
  const log = logger.child({ chatId });

  const resolucao = resolverContaOuCartaoDaLegenda(db, ctx.message?.caption);
  if (!resolucao.ok) {
    await ctx.reply(MENSAGEM_LEGENDA_NECESSARIA);
    return;
  }

  try {
    const buffer = await baixarArquivo(ctx, botToken);
    const modelo = resolverModeloInterpretarPlanilha(db);
    const { transacoes, tokensPrompt, tokensCompletion, custoReal } = await interpretarPlanilha(
      client,
      buffer,
      modelo,
    );

    registrarUsoTokens(db, {
      fluxo: FLUXO_INTERPRETAR_PLANILHA,
      modelo,
      tokensPrompt,
      tokensCompletion,
      custoEstimado: custoReal,
      origem: 'uso_real',
    });

    if (transacoes.length === 0) {
      await ctx.reply(MENSAGEM_PLANILHA_SEM_TRANSACOES);
      return;
    }

    const tool = criarToolRegistrarTransacoesEmLote(db);
    const argumentos = tool.schema.parse({
      conta_id: resolucao.contaId,
      cartao_id: resolucao.cartaoId,
      transacoes,
    });

    definirPendencia(chatId, { tool, argumentos });
    const resumo = tool.avisoConfirmacao?.(argumentos) ?? `${transacoes.length} transações`;
    await ctx.reply(
      `Encontrei ${resumo}. Confirma? Toque em um botão abaixo, ou responda "sim" para registrar (qualquer outra coisa cancela).`,
      { reply_markup: montarTecladoConfirmacao() },
    );
  } catch (erro) {
    log.error({ err: erro }, 'falha ao interpretar planilha');
    await ctx.reply(MENSAGEM_ERRO_EXTRACAO);
  }
}

// Achado real de teste manual: /errado não funcionava nas respostas
// determinísticas deste fluxo ("não é comprovante", "é fatura/boleto", erro
// de extração) — nenhuma delas virava linha em interacoes_ia nem ficava
// rastreada por definirRastroResposta, então o handler de /errado nunca
// achava o que marcar ("Não encontrei o registro dessa resposta"). A
// classificação (eComprovante/tipoDocumento) é decisão da IA e pode estar
// errada (ex: foto legível classificada como "não é comprovante") — merece
// o mesmo rastro de qualquer outra resposta de IA, não só o caminho que
// funde no conversa_texto (que já registrava certo).
async function responderERastrear(
  ctx: Context,
  db: DbClient,
  chatId: number,
  modelo: string,
  resposta: string,
  resultado: 'sucesso' | 'erro',
): Promise<void> {
  const traceId = randomUUID();
  const mensagemEnviada = await ctx.reply(resposta);
  definirRastroResposta(mensagemEnviada.message_id, traceId);
  registrarInteracaoIa(db, {
    traceId,
    fluxo: FLUXO_LEITURA_COMPROVANTE,
    modelo,
    respostaModelo: resposta,
    resultado,
    chatId,
  });
}

async function processarComprovante(
  ctx: Context,
  db: DbClient,
  client: OpenAI,
  logger: Logger,
  botToken: string,
  chatId: number,
  mimeType: string,
): Promise<void> {
  const log = logger.child({ chatId });
  const modelo = resolverModeloLeituraComprovante(db);

  let resultado: ResultadoExtracaoComprovante;
  try {
    const buffer = await baixarArquivo(ctx, botToken);
    const extracao = await extrairComprovante(client, buffer, mimeType, modelo);
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
    // Achado real confirmado em teste manual: se o provedor rejeitar PDF
    // (formato ainda não aceito na chamada multimodal), a falha cai aqui —
    // mensagem específica de PDF em vez da genérica, sem tentar de novo.
    const respostaErro = mimeType === 'application/pdf' ? MENSAGEM_PDF_NAO_SUPORTADO : MENSAGEM_ERRO_EXTRACAO;
    await responderERastrear(ctx, db, chatId, modelo, respostaErro, 'erro');
    return;
  }

  if (!resultado.eComprovante) {
    await responderERastrear(ctx, db, chatId, modelo, MENSAGEM_NAO_COMPROVANTE, 'sucesso');
    return;
  }

  if (resultado.tipoDocumento === 'fatura_cartao' || resultado.tipoDocumento === 'boleto_divida') {
    await responderERastrear(ctx, db, chatId, modelo, MENSAGEM_FATURA_BOLETO, 'sucesso');
    return;
  }

  const mensagemSintetica = montarMensagemSintetica(resultado);
  const tools = exigirConfirmacaoDeRegistro(montarToolsConversa(db, client));
  await processarMensagemTexto(ctx, db, client, logger, tools, mensagemSintetica, chatId);
}

export function createHandlerMidia(client: OpenAI, db: DbClient, logger: Logger, botToken: string) {
  return async function handlerMidia(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;

    const tipo = resolverTipoArquivo(ctx);
    if (tipo.tipo === 'nao_suportado') {
      await ctx.reply(MENSAGEM_TIPO_NAO_SUPORTADO);
      return;
    }

    if (tipo.tipo === 'planilha') {
      await processarPlanilha(ctx, db, client, logger, botToken, chatId);
      return;
    }

    await processarComprovante(ctx, db, client, logger, botToken, chatId, tipo.mimeType);
  };
}
