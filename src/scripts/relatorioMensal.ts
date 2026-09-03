import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Bot } from 'grammy';
import type OpenAI from 'openai';
import { createOpenRouterClient } from '../ai/openrouter.js';
import { FLUXO_RELATORIO_MENSAL, gerarResumoMensal, resolverModeloRelatorioMensal } from '../ai/relatorioMensal.js';
import { loadEnv } from '../config/env.js';
import { getDb, type DbClient } from '../db/client.js';
import { registrarInteracaoIa } from '../db/repositories/interacoesIa.js';
import { registrarUsoTokens } from '../db/repositories/usoTokens.js';
import { createLogger } from '../logging/logger.js';
import { agregarFinanceiroPeriodo } from '../relatorios/financeiro.js';
import { formatarRelatorio } from '../relatorios/formatar.js';
import { calcularJanelaAnterior, calcularJanelaPeriodo } from '../relatorios/janela.js';
import { agregarUsoIaPeriodo } from '../relatorios/usoIa.js';
import { dormirAte } from './dormirAte.js';

// Próximo último dia do mês às 23h a partir de `agora` — mesmo princípio de
// calcularProximoDomingoAs23h (relatorioSemanal.ts): se hoje já é o último
// dia do mês e ainda não passou das 23h, dispara hoje; senão vai pro último
// dia do mês seguinte. Reavaliado a cada execução do processo (ver main()).
export function calcularProximoUltimoDiaDoMesAs23h(agora: Date): Date {
  const ultimoDiaMesAtual = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  const candidato = new Date(agora.getFullYear(), agora.getMonth(), ultimoDiaMesAtual, 23, 0, 0, 0);

  if (candidato.getTime() > agora.getTime()) {
    return candidato;
  }

  const ultimoDiaProximoMes = new Date(agora.getFullYear(), agora.getMonth() + 2, 0).getDate();
  return new Date(agora.getFullYear(), agora.getMonth() + 1, ultimoDiaProximoMes, 23, 0, 0, 0);
}

export async function montarRelatorioMensal(db: DbClient, client: OpenAI, agora: Date = new Date()): Promise<string> {
  const janelaAtual = calcularJanelaPeriodo('mes', agora);
  const janelaAnterior = calcularJanelaAnterior('mes', janelaAtual);

  const financeiro = agregarFinanceiroPeriodo(db, janelaAtual);
  const usoIa = agregarUsoIaPeriodo(db, janelaAtual);
  const financeiroAnterior = agregarFinanceiroPeriodo(db, janelaAnterior);
  const usoIaAnterior = agregarUsoIaPeriodo(db, janelaAnterior);

  const modelo = resolverModeloRelatorioMensal(db);
  const resultado = await gerarResumoMensal(
    client,
    { inicio: janelaAtual.inicio, fim: janelaAtual.fim, financeiro, usoIa, financeiroAnterior, usoIaAnterior },
    modelo,
  );

  registrarInteracaoIa(db, {
    traceId: randomUUID(),
    fluxo: FLUXO_RELATORIO_MENSAL,
    modelo,
    respostaModelo: resultado.resumoTexto,
    resultado: 'sucesso',
    tokensPrompt: resultado.tokensPrompt,
    tokensCompletion: resultado.tokensCompletion,
  });

  registrarUsoTokens(db, {
    fluxo: FLUXO_RELATORIO_MENSAL,
    modelo,
    tokensPrompt: resultado.tokensPrompt,
    tokensCompletion: resultado.tokensCompletion,
    custoEstimado: 0,
    origem: 'uso_real',
  });

  const relatorio = formatarRelatorio({ inicio: janelaAtual.inicio, fim: janelaAtual.fim, financeiro, usoIa });

  return `${relatorio}\n\n**Resumo do mês**\n${resultado.resumoTexto}`;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(undefined, env.logLevel);
  const db = getDb(env);
  const client = createOpenRouterClient(env.openrouterApiKey);
  const bot = new Bot(env.telegramBotToken);

  // --agora pula a espera pra permitir teste manual sem esperar o último dia
  // do mês de verdade (node dist/scripts/relatorioMensal.js --agora).
  if (!process.argv.includes('--agora')) {
    const proximoDisparo = calcularProximoUltimoDiaDoMesAs23h(new Date());
    logger.info({ proximoDisparo: proximoDisparo.toISOString() }, 'aguardando próximo relatório mensal');
    await dormirAte(proximoDisparo.getTime());
  }

  const texto = await montarRelatorioMensal(db, client);
  for (const chatId of env.telegramAllowedChatIds) {
    await bot.api.sendMessage(chatId, texto);
  }
  logger.info('relatório mensal enviado');
}

// Guard pra rodar main() só quando o arquivo é executado diretamente — ver
// mesmo padrão em monitorarPrecos.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erro: unknown) => {
    console.error('falha ao gerar relatório mensal', erro);
    process.exitCode = 1;
  });
}
