import { fileURLToPath } from 'node:url';
import { loadEnv } from '../config/env.js';
import { getDb, type DbClient } from '../db/client.js';
import { listarContasOpenFinance } from '../db/repositories/contasOpenFinance.js';
import { atualizarItem, autenticar } from '../integracoes/pluggy/cliente.js';
import { createLogger, type Logger } from '../logging/logger.js';
import { dormirAte } from './dormirAte.js';
import { tratarErroCriticoJob } from './tratarErroCriticoJob.js';

// Sandbox da Pluggy expira em 21 dias sem uso (achado de pesquisa da Tarefa
// 100/PLANO.md, seção "Ambientes") — renovado bem antes disso pra nunca
// deixar a Homologação sem dado novo por causa disso. Não existe em Produção
// (item real não expira por esse motivo).
const INTERVALO_RENOVACAO_MS = 20 * 24 * 60 * 60 * 1000;

export async function renovarSandboxPluggy(
  db: DbClient,
  logger: Logger,
  botToken: string,
  chatIds: string[],
  pluggyEnv: { clientId: string; clientSecret: string },
): Promise<void> {
  const apiKey = await autenticar(pluggyEnv.clientId, pluggyEnv.clientSecret);

  const itemIds = [...new Set(listarContasOpenFinance(db).map((mapeamento) => mapeamento.pluggyItemId))];

  for (const itemId of itemIds) {
    try {
      await atualizarItem(apiKey, itemId);
    } catch (erro) {
      // Um item com problema (removido no dashboard, etc.) não deve impedir
      // renovar os demais.
      await tratarErroCriticoJob(db, logger, 'renovar_sandbox_pluggy', erro, botToken, chatIds);
    }
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(undefined, env.logLevel);
  const db = getDb(env);

  if (env.ambiente === 'producao') {
    // Sem sleep aqui de propósito: em Produção este job nunca deveria nem
    // estar no docker-compose (Tarefa 105), mas o guard fica explícito e
    // barato mesmo assim, mesmo raciocínio de nunca confiar só na composição
    // externa pra uma decisão de segurança/custo.
    logger.info('renovar_sandbox_pluggy só roda em Homologação — saindo (ambiente = producao)');
    return;
  }

  if (env.pluggy === null) {
    logger.info('integração Pluggy desligada (env.pluggy === null) — renovação de sandbox não vai rodar');
    await dormirAte(Date.now() + INTERVALO_RENOVACAO_MS);
    return;
  }

  try {
    if (!process.argv.includes('--agora')) {
      logger.info({ intervaloMs: INTERVALO_RENOVACAO_MS }, 'aguardando próximo ciclo de renovação do sandbox Pluggy');
      await dormirAte(Date.now() + INTERVALO_RENOVACAO_MS);
    }

    await renovarSandboxPluggy(db, logger, env.telegramBotToken, env.telegramAllowedChatIds, env.pluggy);
  } catch (erro) {
    await tratarErroCriticoJob(db, logger, 'renovar_sandbox_pluggy', erro, env.telegramBotToken, env.telegramAllowedChatIds);
    throw erro;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erro: unknown) => {
    console.error('falha ao renovar sandbox Pluggy', erro);
    process.exitCode = 1;
  });
}
