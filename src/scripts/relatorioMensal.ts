import { fileURLToPath } from 'node:url';
import { Bot, InputFile } from 'grammy';
import { createOpenRouterClient } from '../ai/openrouter.js';
import { configurarFormatacaoPadrao } from '../bot/formatoMensagens.js';
import { loadEnv } from '../config/env.js';
import { getDb } from '../db/client.js';
import { createLogger } from '../logging/logger.js';
import { gerarRelatorioMensalCompleto } from '../relatorios/relatorioMensalCompleto.js';
import { dormirAte } from './dormirAte.js';
import { tratarErroCriticoJob } from './tratarErroCriticoJob.js';

// Próximo dia 1 do mês às 23h a partir de `agora` — dispara um dia depois
// do mês já ter fechado de vez, em vez de no próprio último dia à noite
// (podia sair antes da última transação do dia entrar). Achado real a
// pedido do usuário (2026-09-20). Mesmo princípio de calcularProximaSegundaAs23h
// (relatorioSemanal.ts): se hoje já é dia 1 e ainda não passou das 23h,
// dispara hoje; senão vai pro dia 1 do mês seguinte. Reavaliado a cada
// execução do processo (ver main()).
export function calcularProximoDia1DoMesAs23h(agora: Date): Date {
  const candidato = new Date(agora.getFullYear(), agora.getMonth(), 1, 23, 0, 0, 0);

  if (candidato.getTime() > agora.getTime()) {
    return candidato;
  }

  return new Date(agora.getFullYear(), agora.getMonth() + 1, 1, 23, 0, 0, 0);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(undefined, env.logLevel);
  const db = getDb(env);
  const client = createOpenRouterClient(env.openrouterApiKey);
  const bot = new Bot(env.telegramBotToken);
  configurarFormatacaoPadrao(bot);

  try {
    // --agora pula a espera pra permitir teste manual sem esperar o dia 1 do
    // mês de verdade (node dist/scripts/relatorioMensal.js --agora).
    if (!process.argv.includes('--agora')) {
      const proximoDisparo = calcularProximoDia1DoMesAs23h(new Date());
      logger.info({ proximoDisparo: proximoDisparo.toISOString() }, 'aguardando próximo relatório mensal');
      await dormirAte(proximoDisparo.getTime());
    }

    // Dispara no dia 1, mas o relatório é do mês que fechou ontem (último
    // dia do mês anterior) — usa "ontem" como referência pra
    // calcularJanelaPeriodo resolver o mês certo, nunca o mês novo que
    // começou hoje.
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const { buffer, nomeArquivo } = await gerarRelatorioMensalCompleto(db, client, ontem);
    for (const chatId of env.telegramAllowedChatIds) {
      await bot.api.sendDocument(chatId, new InputFile(buffer, nomeArquivo));
    }
    logger.info('relatório mensal (PDF) enviado');
  } catch (erro) {
    await tratarErroCriticoJob(db, logger, 'relatorio_mensal', erro, env.telegramBotToken, env.telegramAllowedChatIds);
    throw erro;
  }
}

// Guard pra rodar main() só quando o arquivo é executado diretamente — ver
// mesmo padrão em monitorarPrecos.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erro: unknown) => {
    console.error('falha ao gerar relatório mensal', erro);
    process.exitCode = 1;
  });
}
