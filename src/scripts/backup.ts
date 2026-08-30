import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../config/env.js';
import { getDb } from '../db/client.js';
import { createLogger, type Logger } from '../logging/logger.js';

const RETENCAO_DIAS = 7;
const DIR_BACKUP = './data/backups';

const env = loadEnv();
const logger = createLogger(undefined, env.logLevel);

function removerBackupsExpirados(dir: string, retencaoDias: number, logger: Logger): void {
  const limite = Date.now() - retencaoDias * 24 * 60 * 60 * 1000;

  for (const arquivo of readdirSync(dir)) {
    const caminho = join(dir, arquivo);

    if (statSync(caminho).mtimeMs < limite) {
      unlinkSync(caminho);
      logger.info({ caminho }, 'backup expirado removido');
    }
  }
}

async function main(): Promise<void> {
  const db = getDb(env);

  mkdirSync(DIR_BACKUP, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destino = join(DIR_BACKUP, `autofinance-${env.ambiente}-${timestamp}.db`);

  db.prepare('VACUUM INTO ?').run(destino);
  logger.info({ destino }, 'backup do banco criado');

  removerBackupsExpirados(DIR_BACKUP, RETENCAO_DIAS, logger);
}

main().catch((erro: unknown) => {
  logger.error({ err: erro }, 'falha ao gerar backup do banco');
  process.exitCode = 1;
});
