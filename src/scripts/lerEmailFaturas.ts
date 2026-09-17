import { fileURLToPath } from 'node:url';
import { Bot } from 'grammy';
import type { gmail_v1 } from 'googleapis';
import { createOpenRouterClient } from '../ai/openrouter.js';
import { FLUXO_LEITURA_COMPROVANTE, extrairComprovante, resolverModeloLeituraComprovante } from '../ai/extracaoComprovante.js';
import { criarToolRegistrarFaturaEmail } from '../ai/tools/registrarFaturaEmail.js';
import { criarToolRegistrarParcelaEmail } from '../ai/tools/registrarParcelaEmail.js';
import { resolverCartaoId, resolverDividaPorIdentificador } from '../ai/tools/resolucao.js';
import { definirPendencia } from '../bot/confirmacao.js';
import { configurarFormatacaoPadrao } from '../bot/formatoMensagens.js';
import { loadEnv } from '../config/env.js';
import { getDb, type DbClient } from '../db/client.js';
import { criarClientesGoogle } from '../integracoes/google/auth.js';
import { emailJaProcessado, marcarEmailProcessado } from '../db/repositories/emailsProcessados.js';
import { registrarUsoTokens } from '../db/repositories/usoTokens.js';
import { createLogger, type Logger } from '../logging/logger.js';
import { dormirAte } from './dormirAte.js';
import { tratarErroCriticoJob } from './tratarErroCriticoJob.js';

// Polling, não "próximo horário fixo" (diferente de relatorioMensal/verificarDespesasFixas)
// — e-mail pode chegar a qualquer hora. Intervalo generoso o suficiente pra não
// estourar cota gratuita da Gmail API (ver tasks/plan.md, Risks).
const INTERVALO_POLLING_MS = 3 * 60 * 60 * 1000;

// Gmail não tem um cursor "desde o último processado" — a busca sempre olha
// uma janela recente por data; emails_processados garante que o mesmo
// gmail_message_id nunca é reprocessado, independente de reaparecer na busca.
const JANELA_BUSCA_DIAS = 30;
const QUERY_GMAIL = `has:attachment newer_than:${JANELA_BUSCA_DIAS}d`;

const MIME_TYPES_ACEITOS = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function encontrarParteAnexo(parte: gmail_v1.Schema$MessagePart | undefined): gmail_v1.Schema$MessagePart | undefined {
  if (!parte) return undefined;

  if (parte.body?.attachmentId && parte.mimeType && MIME_TYPES_ACEITOS.has(parte.mimeType)) {
    return parte;
  }

  for (const filha of parte.parts ?? []) {
    const encontrada = encontrarParteAnexo(filha);
    if (encontrada) return encontrada;
  }

  return undefined;
}

function decodificarBase64Url(dados: string): Buffer {
  return Buffer.from(dados, 'base64');
}

async function processarEmail(
  db: DbClient,
  gmail: gmail_v1.Gmail,
  bot: Bot,
  logger: Logger,
  chatIds: string[],
  clienteIa: ReturnType<typeof createOpenRouterClient>,
  messageId: string,
): Promise<void> {
  const log = logger.child({ messageId });

  const mensagem = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  const parteAnexo = encontrarParteAnexo(mensagem.data.payload ?? undefined);

  if (!parteAnexo?.body?.attachmentId || !parteAnexo.mimeType) {
    marcarEmailProcessado(db, messageId, 'ignorado_nao_e_fatura');
    log.info('e-mail com anexo, mas nenhum anexo em formato reconhecido (pdf/imagem)');
    return;
  }

  const anexo = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: parteAnexo.body.attachmentId,
  });
  if (!anexo.data.data) {
    marcarEmailProcessado(db, messageId, 'ignorado_nao_e_fatura');
    return;
  }
  const buffer = decodificarBase64Url(anexo.data.data);

  const modelo = resolverModeloLeituraComprovante(db);
  const extracao = await extrairComprovante(clienteIa, buffer, parteAnexo.mimeType, modelo);
  registrarUsoTokens(db, {
    fluxo: FLUXO_LEITURA_COMPROVANTE,
    modelo,
    tokensPrompt: extracao.tokensPrompt,
    tokensCompletion: extracao.tokensCompletion,
    custoEstimado: extracao.custoReal,
    origem: 'uso_real',
  });

  const { resultado } = extracao;
  if (!resultado.eComprovante || (resultado.tipoDocumento !== 'fatura_cartao' && resultado.tipoDocumento !== 'boleto_divida')) {
    marcarEmailProcessado(db, messageId, 'ignorado_nao_e_fatura');
    log.info({ tipoDocumento: resultado.tipoDocumento }, 'anexo não é fatura/boleto, ignorado');
    return;
  }

  if (!resultado.valor || !resultado.data || !resultado.identificador) {
    marcarEmailProcessado(db, messageId, 'sem_correspondencia');
    log.info('fatura/boleto reconhecido, mas faltou valor/data/identificador pra resolver correspondência');
    return;
  }

  const traceId = `email:${messageId}`;

  if (resultado.tipoDocumento === 'fatura_cartao') {
    const resolucao = resolverCartaoId(db, undefined, resultado.identificador);
    if (!resolucao.ok) {
      marcarEmailProcessado(db, messageId, 'sem_correspondencia');
      log.info({ identificador: resultado.identificador }, 'não achei cartão correspondente ao identificador extraído');
      return;
    }

    const tool = criarToolRegistrarFaturaEmail(db);
    const argumentos = tool.schema.parse({
      cartao_id: resolucao.id,
      mes_referencia: resultado.data.slice(0, 7),
      valor: resultado.valor,
    });

    const resumo = tool.avisoConfirmacao?.(argumentos) ?? 'fatura de cartão extraída de e-mail';
    for (const chatId of chatIds) {
      definirPendencia(Number(chatId), { tool, argumentos });
      await bot.api.sendMessage(chatId, `📧 ${resumo} Confirma? Responda "sim" para registrar, ou qualquer outra coisa pra cancelar.`);
    }
    marcarEmailProcessado(db, messageId, 'pendente_confirmacao');
    return;
  }

  const resolucao = resolverDividaPorIdentificador(db, resultado.identificador);
  if (!resolucao.ok) {
    marcarEmailProcessado(db, messageId, 'sem_correspondencia');
    log.info({ identificador: resultado.identificador }, 'não achei dívida correspondente ao identificador extraído');
    return;
  }

  const tool = criarToolRegistrarParcelaEmail(db);
  const argumentos = tool.schema.parse({
    divida_id: resolucao.id,
    valor: resultado.valor,
    data_vencimento: resultado.data,
    trace_id: traceId,
  });

  const resumo = tool.avisoConfirmacao?.(argumentos) ?? 'boleto de parcela extraído de e-mail';
  for (const chatId of chatIds) {
    definirPendencia(Number(chatId), { tool, argumentos });
    await bot.api.sendMessage(chatId, `📧 ${resumo} Confirma? Responda "sim" para registrar, ou qualquer outra coisa pra cancelar.`);
  }
  marcarEmailProcessado(db, messageId, 'pendente_confirmacao');
}

export async function verificarEmails(
  db: DbClient,
  gmail: gmail_v1.Gmail,
  bot: Bot,
  logger: Logger,
  chatIds: string[],
  clienteIa: ReturnType<typeof createOpenRouterClient>,
): Promise<void> {
  const lista = await gmail.users.messages.list({ userId: 'me', q: QUERY_GMAIL });

  for (const item of lista.data.messages ?? []) {
    if (!item.id || emailJaProcessado(db, item.id)) continue;
    await processarEmail(db, gmail, bot, logger, chatIds, clienteIa, item.id);
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(undefined, env.logLevel);
  const db = getDb(env);
  const bot = new Bot(env.telegramBotToken);
  configurarFormatacaoPadrao(bot);

  if (env.google === null) {
    // Sem sleep aqui, o loop `while true; do node ...; done` do compose
    // reiniciaria o processo instantaneamente pra sempre (busy-loop) — dorme
    // pelo mesmo intervalo do polling normal antes de sair, mesmo com --agora
    // (não faz sentido "testar agora" um caminho que não faz nada).
    logger.info('integração Google desligada (env.google === null) — job de leitura de e-mail não vai rodar');
    await dormirAte(Date.now() + INTERVALO_POLLING_MS);
    return;
  }

  const { gmail } = criarClientesGoogle(env.google);
  const clienteIa = createOpenRouterClient(env.openrouterApiKey);

  try {
    // --agora pula a espera pra permitir teste manual (node dist/scripts/lerEmailFaturas.js --agora).
    // Igual verificarDespesasFixas: um ciclo por execução — o loop externo do
    // docker-compose (`while true; do node ...; done`) reinicia o processo
    // depois, então dormir aqui é o "esperar até o próximo poll" de verdade.
    if (!process.argv.includes('--agora')) {
      logger.info({ intervaloMs: INTERVALO_POLLING_MS }, 'aguardando próximo ciclo de leitura de e-mail');
      await dormirAte(Date.now() + INTERVALO_POLLING_MS);
    }

    await verificarEmails(db, gmail, bot, logger, env.telegramAllowedChatIds, clienteIa);
  } catch (erro) {
    await tratarErroCriticoJob(db, logger, 'ler_email_faturas', erro, env.telegramBotToken, env.telegramAllowedChatIds);
    throw erro;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erro: unknown) => {
    console.error('falha ao ler e-mail de faturas', erro);
    process.exitCode = 1;
  });
}
