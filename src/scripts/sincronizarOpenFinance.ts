import { fileURLToPath } from 'node:url';
import { Bot } from 'grammy';
import { configurarFormatacaoPadrao } from '../bot/formatoMensagens.js';
import { loadEnv } from '../config/env.js';
import { getDb, type DbClient } from '../db/client.js';
import {
  encontrarPagamentoFaturaOuParcelaCorrespondente,
  encontrarTransacaoManualCorrespondente,
  pareceSaque,
} from '../db/repositories/correspondenciaOpenFinance.js';
import { listarContasOpenFinance, type MapeamentoOpenFinance } from '../db/repositories/contasOpenFinance.js';
import { criarTransacaoOpenFinance } from '../db/repositories/transacoes.js';
import {
  marcarTransacaoProcessada,
  transacaoJaProcessada,
  type ResultadoProcessamento,
} from '../db/repositories/transacoesOpenFinanceProcessadas.js';
import { autenticar, listarTransacoes, type TransacaoPluggy } from '../integracoes/pluggy/cliente.js';
import { createLogger, type Logger } from '../logging/logger.js';
import { dormirAte } from './dormirAte.js';
import { tratarErroCriticoJob } from './tratarErroCriticoJob.js';

// Polling (achado de pesquisa da Fase 8, ver tasks/plan.md): a Pluggy
// recomenda webhook, mas o projeto decidiu não abrir servidor HTTP público
// novo (mesmo princípio de segurança da Fase 7). Mesmo intervalo de
// sincronizarCalendario.ts — não precisa ser "tempo real" pra acompanhamento
// financeiro pessoal.
const INTERVALO_SINCRONIZACAO_MS = 6 * 60 * 60 * 1000;

// Sem cursor "desde o último processado" por conta (mais simples) — sempre
// olha uma janela recente; transacoes_open_finance_processadas garante que
// a mesma transação nunca é processada duas vezes, independente de
// reaparecer na busca. Mesmo princípio de JANELA_BUSCA_DIAS em lerEmailFaturas.ts.
const JANELA_SINCRONIZACAO_DIAS = 35;

function dataDesde(): string {
  const data = new Date(Date.now() - JANELA_SINCRONIZACAO_DIAS * 24 * 60 * 60 * 1000);
  return data.toISOString().slice(0, 10);
}

async function processarTransacao(
  db: DbClient,
  bot: Bot,
  logger: Logger,
  chatIds: string[],
  mapeamento: MapeamentoOpenFinance,
  transacao: TransacaoPluggy,
): Promise<void> {
  const valor = Math.abs(transacao.amount);
  const tipo = transacao.amount < 0 ? 'despesa' : 'receita';
  const identificador = mapeamento.cartaoId !== null ? { cartaoId: mapeamento.cartaoId } : { contaId: mapeamento.contaId as number };

  const marcar = (resultado: ResultadoProcessamento): void => marcarTransacaoProcessada(db, transacao.id, resultado);

  if (pareceSaque(transacao)) {
    marcar('saque_ignorado');
    return;
  }

  const resultadoManual = encontrarTransacaoManualCorrespondente(db, { ...identificador, valor, data: transacao.date });
  if (resultadoManual === 'ambigua') {
    // Não resolve sozinho (mesmo princípio da Fase 7) — trata como
    // correspondência (mais seguro que arriscar duplicar) e loga pra
    // conferência manual depois.
    logger.warn({ transacaoId: transacao.id }, 'correspondência manual ambígua — tratada como encontrada, não cria transação');
    marcar('correspondencia_manual');
    return;
  }
  if (resultadoManual === 'encontrada') {
    marcar('correspondencia_manual');
    return;
  }

  // Checagem 2 só faz sentido do lado da conta bancária que debita o
  // pagamento — uma compra no extrato do próprio cartão nunca é o
  // pagamento da fatura desse cartão.
  if (mapeamento.contaId !== null) {
    const resultadoFatura = encontrarPagamentoFaturaOuParcelaCorrespondente(db, {
      contaId: mapeamento.contaId,
      valor,
      data: transacao.date,
    });
    if (resultadoFatura === 'encontrada' || resultadoFatura === 'ambigua') {
      marcar('correspondencia_fatura_parcela');
      return;
    }
  }

  criarTransacaoOpenFinance(db, {
    contaId: mapeamento.contaId ?? undefined,
    cartaoId: mapeamento.cartaoId ?? undefined,
    tipo,
    valor,
    categoria: transacao.category ?? 'não categorizado',
    descricao: transacao.description,
    data: transacao.date,
    traceId: `open_finance:${transacao.id}`,
  });
  marcar('transacao_criada');

  for (const chatId of chatIds) {
    await bot.api.sendMessage(
      chatId,
      `🔄 ${tipo === 'despesa' ? 'Despesa' : 'Receita'} sincronizada automaticamente: R$ ${valor.toFixed(2)} — ${transacao.description} (${transacao.date})`,
    );
  }
}

export async function sincronizarOpenFinance(
  db: DbClient,
  bot: Bot,
  logger: Logger,
  chatIds: string[],
  pluggyEnv: { clientId: string; clientSecret: string },
): Promise<void> {
  const apiKey = await autenticar(pluggyEnv.clientId, pluggyEnv.clientSecret);
  const desde = dataDesde();

  for (const mapeamento of listarContasOpenFinance(db)) {
    try {
      const transacoes = await listarTransacoes(apiKey, mapeamento.pluggyAccountId, desde);

      for (const transacao of transacoes) {
        if (transacaoJaProcessada(db, transacao.id)) continue;
        await processarTransacao(db, bot, logger, chatIds, mapeamento, transacao);
      }
    } catch (erro) {
      // Uma conta com problema (token expirado, item desconectado) não deve
      // impedir sincronizar as outras.
      logger.error({ err: erro, pluggyAccountId: mapeamento.pluggyAccountId }, 'falha ao sincronizar conta Open Finance');
    }
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(undefined, env.logLevel);
  const db = getDb(env);
  const bot = new Bot(env.telegramBotToken);
  configurarFormatacaoPadrao(bot);

  if (env.pluggy === null) {
    // Sem sleep aqui, o loop `while true; do node ...; done` do compose
    // reiniciaria o processo instantaneamente pra sempre (busy-loop) —
    // mesmo achado real já corrigido na Fase 7 (lerEmailFaturas.ts).
    logger.info('integração Pluggy desligada (env.pluggy === null) — sincronização de Open Finance não vai rodar');
    await dormirAte(Date.now() + INTERVALO_SINCRONIZACAO_MS);
    return;
  }

  try {
    // --agora pula a espera pra permitir teste manual (node dist/scripts/sincronizarOpenFinance.js --agora).
    if (!process.argv.includes('--agora')) {
      logger.info({ intervaloMs: INTERVALO_SINCRONIZACAO_MS }, 'aguardando próximo ciclo de sincronização Open Finance');
      await dormirAte(Date.now() + INTERVALO_SINCRONIZACAO_MS);
    }

    await sincronizarOpenFinance(db, bot, logger, env.telegramAllowedChatIds, env.pluggy);
  } catch (erro) {
    await tratarErroCriticoJob(db, logger, 'sincronizar_open_finance', erro, env.telegramBotToken, env.telegramAllowedChatIds);
    throw erro;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erro: unknown) => {
    console.error('falha ao sincronizar Open Finance', erro);
    process.exitCode = 1;
  });
}
