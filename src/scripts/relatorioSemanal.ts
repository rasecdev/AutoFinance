import { fileURLToPath } from 'node:url';
import { Bot, InputFile } from 'grammy';
import { configurarFormatacaoPadrao } from '../bot/formatoMensagens.js';
import { loadEnv } from '../config/env.js';
import { getDb } from '../db/client.js';
import { createLogger } from '../logging/logger.js';
import { montarImagemRelatorioSemanal } from '../relatorios/imagemSemanal.js';
import { dormirAte } from './dormirAte.js';
import { tratarErroCriticoJob } from './tratarErroCriticoJob.js';

// Próxima segunda-feira às 23h a partir de `agora` — dispara um dia depois
// da semana (segunda-domingo) já ter fechado de vez, em vez de no próprio
// domingo à noite (podia sair antes da última transação do dia entrar).
// Achado real a pedido do usuário (2026-09-20). Se já é segunda e ainda não
// passou das 23h, dispara hoje; senão vai pra segunda seguinte. Reavaliado a
// cada execução do processo (ver main()), não precisa de lib de cron.
export function calcularProximaSegundaAs23h(agora: Date): Date {
  const diaSemana = agora.getDay(); // 0 = domingo, 1 = segunda
  const diasAteSegunda = (1 - diaSemana + 7) % 7;
  const candidato = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + diasAteSegunda, 23, 0, 0, 0);

  if (candidato.getTime() <= agora.getTime()) {
    candidato.setDate(candidato.getDate() + 7);
  }

  return candidato;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(undefined, env.logLevel);
  const db = getDb(env);
  const bot = new Bot(env.telegramBotToken);
  configurarFormatacaoPadrao(bot);

  try {
    // --agora pula a espera pra permitir teste manual sem esperar a segunda
    // de verdade (node dist/scripts/relatorioSemanal.js --agora).
    if (!process.argv.includes('--agora')) {
      const proximoDisparo = calcularProximaSegundaAs23h(new Date());
      logger.info({ proximoDisparo: proximoDisparo.toISOString() }, 'aguardando próximo relatório semanal');
      await dormirAte(proximoDisparo.getTime());
    }

    // Dispara na segunda, mas o relatório é da semana que fechou ontem
    // (domingo) — usa "ontem" como referência pra calcularJanelaPeriodo
    // resolver a semana certa, nunca a semana nova que começou hoje.
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const imagem = await montarImagemRelatorioSemanal(db, ontem);
    for (const chatId of env.telegramAllowedChatIds) {
      await bot.api.sendPhoto(chatId, new InputFile(imagem));
    }
    logger.info('relatório semanal (imagem) enviado');
  } catch (erro) {
    await tratarErroCriticoJob(db, logger, 'relatorio_semanal', erro, env.telegramBotToken, env.telegramAllowedChatIds);
    throw erro;
  }
}

// Guard pra rodar main() só quando o arquivo é executado diretamente — ver
// mesmo padrão em monitorarPrecos.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erro: unknown) => {
    console.error('falha ao gerar relatório semanal', erro);
    process.exitCode = 1;
  });
}
