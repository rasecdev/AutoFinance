import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Bot, InputFile } from 'grammy';
import type OpenAI from 'openai';
import { createOpenRouterClient } from '../ai/openrouter.js';
import { configurarFormatacaoPadrao } from '../bot/formatoMensagens.js';
import { FLUXO_RELATORIO_MENSAL, gerarResumoMensal, resolverModeloRelatorioMensal } from '../ai/relatorioMensal.js';
import { loadEnv } from '../config/env.js';
import { getDb, type DbClient } from '../db/client.js';
import { contarErrosPeriodo } from '../db/repositories/errosExecucao.js';
import { registrarInteracaoIa } from '../db/repositories/interacoesIa.js';
import { registrarUsoTokens } from '../db/repositories/usoTokens.js';
import { createLogger } from '../logging/logger.js';
import { montarDadosComparativoReceitaDespesa, montarDadosDespesaPorCategoria } from '../relatorios/dadosGrafico.js';
import { agregarFinanceiroPeriodo } from '../relatorios/financeiro.js';
import { renderizarGrafico } from '../relatorios/grafico.js';
import { calcularJanelaAnterior, calcularJanelaPeriodo } from '../relatorios/janela.js';
import { gerarPdfRelatorioMensal } from '../relatorios/pdfMensal.js';
import { agregarUsoIaPeriodo } from '../relatorios/usoIa.js';
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

export type RelatorioMensalPdf = {
  buffer: Buffer;
  nomeArquivo: string;
};

// PDF mensal SUBSTITUI o texto completo que existia até aqui (a pedido do
// usuário, mesma decisão de Tarefa 118 pro semanal — ver tasks/plan.md) —
// leva o mesmo nível de detalhe do texto de antes (é o "complexo" que cabe
// num PDF). formatarRelatorio/tool relatorio(periodo) no chat continuam
// intactos, sem depender desta função.
export async function montarRelatorioMensal(db: DbClient, client: OpenAI, agora: Date = new Date()): Promise<RelatorioMensalPdf> {
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
    custoEstimado: resultado.custoReal,
    origem: 'uso_real',
  });

  const errosTecnicos = contarErrosPeriodo(db, janelaAtual);

  const dadosGraficoDespesa = montarDadosDespesaPorCategoria(financeiro.porCategoria);
  const rotuloAtual = janelaAtual.inicio.slice(0, 7);
  const rotuloAnterior = janelaAnterior.inicio.slice(0, 7);
  const dadosGraficoComparativo = montarDadosComparativoReceitaDespesa(
    financeiro,
    financeiroAnterior,
    rotuloAtual,
    rotuloAnterior,
  );

  const [graficoDespesa, graficoComparativo] = await Promise.all([
    dadosGraficoDespesa.length > 0 ? renderizarGrafico('pizza', dadosGraficoDespesa) : undefined,
    renderizarGrafico('barra', dadosGraficoComparativo),
  ]);

  const buffer = await gerarPdfRelatorioMensal(
    { inicio: janelaAtual.inicio, fim: janelaAtual.fim, financeiro, usoIa, errosTecnicos },
    resultado.resumoTexto,
    graficoDespesa,
    graficoComparativo,
  );

  return { buffer, nomeArquivo: `relatorio-mensal-${rotuloAtual}.pdf` };
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
    const { buffer, nomeArquivo } = await montarRelatorioMensal(db, client, ontem);
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
