import { fileURLToPath } from 'node:url';
import type { calendar_v3 } from 'googleapis';
import { loadEnv } from '../config/env.js';
import { getDb, type DbClient } from '../db/client.js';
import { obterCartao } from '../db/repositories/cartoes.js';
import { listarParcelasPendentesDividasAtivas } from '../db/repositories/dividas.js';
import {
  atualizarEventoCalendarioFatura,
  listarFaturasAbertas,
  listarFaturasComEventoParaRemover,
  type FaturaAbertaComVencimento,
} from '../db/repositories/faturas.js';
import {
  atualizarEventoCalendarioParcela,
  listarParcelasComEventoParaRemover,
} from '../db/repositories/parcelas.js';
import { criarClientesGoogle } from '../integracoes/google/auth.js';
import { createLogger, type Logger } from '../logging/logger.js';
import { calcularDataVencimentoFatura } from '../relatorios/fluxoCaixa.js';
import { dormirAte } from './dormirAte.js';
import { tratarErroCriticoJob } from './tratarErroCriticoJob.js';

// Não é polling de fonte externa (diferente de lerEmailFaturas) — varredura
// do próprio banco, intervalo mais folgado é suficiente (evento de vencimento
// não precisa aparecer no Calendar minutos depois de criado).
const INTERVALO_SINCRONIZACAO_MS = 6 * 60 * 60 * 1000;

// Janela de lookahead: não cria evento pra vencimento longe demais no futuro
// (ex: parcela 40 de um financiamento de 5 anos) — só o que é relevante pra
// já aparecer na agenda. Constante no código, não variável de ambiente
// (não foi pedido configurabilidade).
const LOOKAHEAD_DIAS = 60;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

function diasAte(dataISO: string, hoje: Date): number {
  return Math.floor((new Date(dataISO).getTime() - hoje.getTime()) / MS_POR_DIA);
}

function dentroDaJanela(dataISO: string, hoje: Date): boolean {
  return diasAte(dataISO, hoje) <= LOOKAHEAD_DIAS;
}

function montarEvento(summary: string, dataVencimento: string): calendar_v3.Schema$Event {
  const proximoDia = new Date(dataVencimento);
  proximoDia.setDate(proximoDia.getDate() + 1);
  const fim = proximoDia.toISOString().slice(0, 10);

  return {
    summary,
    start: { date: dataVencimento },
    end: { date: fim },
  };
}

// Evita update desnecessário (ver tasks/plan.md, Risks) — só grava de novo
// quando o resumo (valor embutido) ou a data de vencimento realmente
// mudaram desde a última sincronização, comparando contra o evento já salvo.
async function eventoMudou(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
  eventoNovo: calendar_v3.Schema$Event,
): Promise<boolean> {
  const atual = await calendar.events.get({ calendarId, eventId }).catch(() => undefined);
  if (!atual) return true;
  return atual.data.summary !== eventoNovo.summary || atual.data.start?.date !== eventoNovo.start?.date;
}

async function criarOuAtualizarEvento(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventoCalendarioIdAtual: string | null,
  eventoNovo: calendar_v3.Schema$Event,
): Promise<{ eventoId: string | null; mudou: boolean }> {
  if (!eventoCalendarioIdAtual) {
    const criado = await calendar.events.insert({ calendarId, requestBody: eventoNovo });
    return { eventoId: criado.data.id ?? null, mudou: true };
  }

  if (!(await eventoMudou(calendar, calendarId, eventoCalendarioIdAtual, eventoNovo))) {
    return { eventoId: eventoCalendarioIdAtual, mudou: false };
  }

  await calendar.events.update({ calendarId, eventId: eventoCalendarioIdAtual, requestBody: eventoNovo });
  return { eventoId: eventoCalendarioIdAtual, mudou: true };
}

async function sincronizarFaturas(
  db: DbClient,
  calendar: calendar_v3.Calendar,
  calendarId: string,
  faturas: FaturaAbertaComVencimento[],
  hoje: Date,
  logger: Logger,
): Promise<void> {
  for (const fatura of faturas) {
    const dataVencimento = calcularDataVencimentoFatura(fatura.mesReferencia, fatura.diaVencimento);
    if (!dentroDaJanela(dataVencimento, hoje)) continue;

    const cartao = obterCartao(db, fatura.cartaoId);
    const summary = `Fatura ${cartao?.nome ?? 'cartão'} — R$ ${fatura.valor.toFixed(2)}`;
    const evento = montarEvento(summary, dataVencimento);

    const { eventoId, mudou } = await criarOuAtualizarEvento(calendar, calendarId, fatura.eventoCalendarioId, evento);
    if (!fatura.eventoCalendarioId && eventoId) {
      atualizarEventoCalendarioFatura(db, fatura.id, eventoId);
    }
    if (mudou) {
      logger.info({ faturaId: fatura.id, eventoId }, 'evento de fatura criado/atualizado no Calendar');
    }
  }
}

async function sincronizarParcelas(
  db: DbClient,
  calendar: calendar_v3.Calendar,
  calendarId: string,
  hoje: Date,
  logger: Logger,
): Promise<void> {
  for (const item of listarParcelasPendentesDividasAtivas(db)) {
    const { parcela, dividaDescricao } = item;
    if (!dentroDaJanela(parcela.dataVencimento, hoje)) continue;

    const summary = `Parcela ${parcela.numeroParcela} — ${dividaDescricao ?? 'dívida'} — R$ ${parcela.valor.toFixed(2)}`;
    const evento = montarEvento(summary, parcela.dataVencimento);

    const { eventoId, mudou } = await criarOuAtualizarEvento(calendar, calendarId, parcela.eventoCalendarioId, evento);
    if (!parcela.eventoCalendarioId && eventoId) {
      atualizarEventoCalendarioParcela(db, parcela.id, eventoId);
    }
    if (mudou) {
      logger.info({ parcelaId: parcela.id, eventoId }, 'evento de parcela criado/atualizado no Calendar');
    }
  }
}

async function removerEventosObsoletos(
  db: DbClient,
  calendar: calendar_v3.Calendar,
  calendarId: string,
  logger: Logger,
): Promise<void> {
  for (const fatura of listarFaturasComEventoParaRemover(db)) {
    if (!fatura.eventoCalendarioId) continue;
    await calendar.events.delete({ calendarId, eventId: fatura.eventoCalendarioId }).catch(() => undefined);
    atualizarEventoCalendarioFatura(db, fatura.id, null);
    logger.info({ faturaId: fatura.id }, 'evento de fatura removido (status não é mais aberta)');
  }

  for (const parcela of listarParcelasComEventoParaRemover(db)) {
    if (!parcela.eventoCalendarioId) continue;
    await calendar.events.delete({ calendarId, eventId: parcela.eventoCalendarioId }).catch(() => undefined);
    atualizarEventoCalendarioParcela(db, parcela.id, null);
    logger.info({ parcelaId: parcela.id }, 'evento de parcela removido (status não é mais pendente)');
  }
}

export async function sincronizarCalendario(
  db: DbClient,
  calendar: calendar_v3.Calendar,
  calendarId: string,
  logger: Logger,
  hoje: Date = new Date(),
): Promise<void> {
  await sincronizarFaturas(db, calendar, calendarId, listarFaturasAbertas(db), hoje, logger);
  await sincronizarParcelas(db, calendar, calendarId, hoje, logger);
  await removerEventosObsoletos(db, calendar, calendarId, logger);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(undefined, env.logLevel);
  const db = getDb(env);

  if (env.google === null) {
    // Sem sleep aqui, o loop `while true; do node ...; done` do compose
    // reiniciaria o processo instantaneamente pra sempre (busy-loop) — dorme
    // pelo mesmo intervalo do polling normal antes de sair, mesmo com --agora
    // (não faz sentido "testar agora" um caminho que não faz nada).
    logger.info('integração Google desligada (env.google === null) — sincronização de calendário não vai rodar');
    await dormirAte(Date.now() + INTERVALO_SINCRONIZACAO_MS);
    return;
  }

  const { calendar } = criarClientesGoogle(env.google);

  try {
    if (!process.argv.includes('--agora')) {
      logger.info({ intervaloMs: INTERVALO_SINCRONIZACAO_MS }, 'aguardando próximo ciclo de sincronização de calendário');
      await dormirAte(Date.now() + INTERVALO_SINCRONIZACAO_MS);
    }

    await sincronizarCalendario(db, calendar, env.google.calendarId, logger);
  } catch (erro) {
    await tratarErroCriticoJob(db, logger, 'sincronizar_calendario', erro, env.telegramBotToken, env.telegramAllowedChatIds);
    throw erro;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erro: unknown) => {
    console.error('falha ao sincronizar calendário', erro);
    process.exitCode = 1;
  });
}
