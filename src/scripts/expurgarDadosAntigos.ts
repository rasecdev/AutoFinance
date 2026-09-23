import { fileURLToPath } from 'node:url';
import { loadEnv } from '../config/env.js';
import { getDb, type DbClient } from '../db/client.js';
import { createLogger, type Logger } from '../logging/logger.js';
import { tratarErroCriticoJob } from './tratarErroCriticoJob.js';

const RETENCAO_DIAS = 90;

// Tabelas operacionais (log/cache de IA, não dado financeiro) que crescem sem
// limite natural — transacoes, contas_open_finance etc. ficam de fora de
// propósito, são o histórico principal do produto.
const TABELAS_EXPURGO = [
  { tabela: 'interacoes_ia', colunaData: 'data_hora' },
  { tabela: 'uso_tokens', colunaData: 'data_hora' },
  { tabela: 'erros_execucao', colunaData: 'data_hora' },
  { tabela: 'emails_processados', colunaData: 'processado_em' },
  { tabela: 'cache_categorizacao', colunaData: 'atualizado_em' },
] as const;

export function expurgarDadosAntigos(
  db: DbClient,
  retencaoDias: number,
  logger: Logger,
  agora = new Date(),
): void {
  const limite = new Date(agora.getTime() - retencaoDias * 24 * 60 * 60 * 1000).toISOString();

  for (const { tabela, colunaData } of TABELAS_EXPURGO) {
    const resultado = db.prepare(`DELETE FROM ${tabela} WHERE ${colunaData} < ?`).run(limite);
    if (resultado.changes > 0) {
      logger.info({ tabela, linhasRemovidas: resultado.changes }, 'linhas antigas expurgadas');
    }
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(undefined, env.logLevel);
  const db = getDb(env);

  try {
    expurgarDadosAntigos(db, RETENCAO_DIAS, logger);
  } catch (erro) {
    await tratarErroCriticoJob(db, logger, 'expurgarDadosAntigos', erro, env.telegramBotToken, env.telegramAllowedChatIds);
    throw erro;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erro: unknown) => {
    console.error('falha ao expurgar dados antigos', erro);
    process.exitCode = 1;
  });
}
