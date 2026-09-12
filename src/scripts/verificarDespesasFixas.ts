import { fileURLToPath } from 'node:url';
import { Bot } from 'grammy';
import { loadEnv } from '../config/env.js';
import { getDb, type DbClient } from '../db/client.js';
import { createLogger } from '../logging/logger.js';
import { detectarDespesasFixasFaltantes, formatarAlertaDespesasFixas } from '../relatorios/despesasFixas.js';
import { calcularJanelaPeriodo } from '../relatorios/janela.js';
import { dormirAte } from './dormirAte.js';
import { calcularProximoUltimoDiaDoMesAs23h } from './relatorioMensal.js';
import { tratarErroCriticoJob } from './tratarErroCriticoJob.js';

// Retorna undefined quando não há despesa faltante no período — mesmo
// princípio de "só alerta quando há algo a decidir" de detectarOportunidades
// (monitorarPrecos.ts), não um relatório que sempre dispara mensagem.
export function obterAlertaDespesasFixas(db: DbClient, agora: Date = new Date()): string | undefined {
  const janela = calcularJanelaPeriodo('mes', agora);
  const faltantes = detectarDespesasFixasFaltantes(db, janela);

  if (faltantes.length === 0) {
    return undefined;
  }

  return formatarAlertaDespesasFixas(faltantes, janela);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(undefined, env.logLevel);
  const db = getDb(env);
  const bot = new Bot(env.telegramBotToken);

  try {
    // --agora pula a espera pra permitir teste manual sem esperar o último dia
    // do mês de verdade (node dist/scripts/verificarDespesasFixas.js --agora).
    if (!process.argv.includes('--agora')) {
      const proximoDisparo = calcularProximoUltimoDiaDoMesAs23h(new Date());
      logger.info({ proximoDisparo: proximoDisparo.toISOString() }, 'aguardando próxima verificação de despesas fixas');
      await dormirAte(proximoDisparo.getTime());
    }

    const alerta = obterAlertaDespesasFixas(db);
    if (alerta) {
      for (const chatId of env.telegramAllowedChatIds) {
        await bot.api.sendMessage(chatId, alerta);
      }
      logger.info('alerta de despesas fixas faltantes enviado');
    } else {
      logger.info('nenhuma despesa fixa faltante no período');
    }
  } catch (erro) {
    await tratarErroCriticoJob(db, logger, 'verificar_despesas_fixas', erro, env.telegramBotToken, env.telegramAllowedChatIds);
    throw erro;
  }
}

// Guard pra rodar main() só quando o arquivo é executado diretamente — ver
// mesmo padrão em monitorarPrecos.ts/relatorioMensal.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erro: unknown) => {
    console.error('falha ao verificar despesas fixas', erro);
    process.exitCode = 1;
  });
}
