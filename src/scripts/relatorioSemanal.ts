import { fileURLToPath } from 'node:url';
import { Bot } from 'grammy';
import { loadEnv } from '../config/env.js';
import { getDb, type DbClient } from '../db/client.js';
import { createLogger } from '../logging/logger.js';
import { agregarFinanceiroPeriodo } from '../relatorios/financeiro.js';
import { formatarRelatorio } from '../relatorios/formatar.js';
import { calcularJanelaAnterior, calcularJanelaPeriodo } from '../relatorios/janela.js';
import { agregarUsoIaPeriodo } from '../relatorios/usoIa.js';

// Próximo domingo às 23h a partir de `agora` — se já é domingo e ainda não
// passou das 23h, dispara hoje; se já passou das 23h (ou não é domingo),
// vai pro domingo seguinte. Reavaliado a cada execução do processo (ver
// main()), não precisa de lib de cron.
export function calcularProximoDomingoAs23h(agora: Date): Date {
  const diaSemana = agora.getDay(); // 0 = domingo
  const diasAteDomingo = (7 - diaSemana) % 7;
  const candidato = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + diasAteDomingo, 23, 0, 0, 0);

  if (candidato.getTime() <= agora.getTime()) {
    candidato.setDate(candidato.getDate() + 7);
  }

  return candidato;
}

function formatarDelta(valor: number): string {
  const sinal = valor >= 0 ? '+' : '';
  return `${sinal}R$ ${valor.toFixed(2)}`;
}

export function montarRelatorioSemanal(db: DbClient, agora: Date = new Date()): string {
  const janelaAtual = calcularJanelaPeriodo('semana', agora);
  const janelaAnterior = calcularJanelaAnterior('semana', janelaAtual);

  const financeiro = agregarFinanceiroPeriodo(db, janelaAtual);
  const usoIa = agregarUsoIaPeriodo(db, janelaAtual);
  const financeiroAnterior = agregarFinanceiroPeriodo(db, janelaAnterior);
  const usoIaAnterior = agregarUsoIaPeriodo(db, janelaAnterior);

  const relatorio = formatarRelatorio({ inicio: janelaAtual.inicio, fim: janelaAtual.fim, financeiro, usoIa });

  const comparacao = [
    '',
    '**Comparação com a semana anterior**',
    `Receita: ${formatarDelta(financeiro.totalReceita - financeiroAnterior.totalReceita)}`,
    `Despesa: ${formatarDelta(financeiro.totalDespesa - financeiroAnterior.totalDespesa)}`,
    `Custo de IA: ${formatarDelta(usoIa.totalCustoEstimado - usoIaAnterior.totalCustoEstimado)}`,
  ].join('\n');

  return `${relatorio}\n${comparacao}`;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(undefined, env.logLevel);
  const db = getDb(env);
  const bot = new Bot(env.telegramBotToken);

  // --agora pula a espera pra permitir teste manual sem esperar o domingo
  // de verdade (node dist/scripts/relatorioSemanal.js --agora).
  if (!process.argv.includes('--agora')) {
    const proximoDisparo = calcularProximoDomingoAs23h(new Date());
    logger.info({ proximoDisparo: proximoDisparo.toISOString() }, 'aguardando próximo relatório semanal');
    await new Promise((resolve) => setTimeout(resolve, proximoDisparo.getTime() - Date.now()));
  }

  const texto = montarRelatorioSemanal(db);
  for (const chatId of env.telegramAllowedChatIds) {
    await bot.api.sendMessage(chatId, texto);
  }
  logger.info('relatório semanal enviado');
}

// Guard pra rodar main() só quando o arquivo é executado diretamente — ver
// mesmo padrão em monitorarPrecos.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erro: unknown) => {
    console.error('falha ao gerar relatório semanal', erro);
    process.exitCode = 1;
  });
}
