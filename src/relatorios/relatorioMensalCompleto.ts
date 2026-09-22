import { randomUUID } from 'node:crypto';
import type OpenAI from 'openai';
import { FLUXO_RELATORIO_MENSAL, gerarResumoMensal, resolverModeloRelatorioMensal } from '../ai/relatorioMensal.js';
import type { DbClient } from '../db/client.js';
import { contarErrosPeriodo } from '../db/repositories/errosExecucao.js';
import { registrarInteracaoIa } from '../db/repositories/interacoesIa.js';
import { registrarUsoTokens } from '../db/repositories/usoTokens.js';
import { montarDadosComparativoReceitaDespesa, montarDadosDespesaPorCategoria } from './dadosGrafico.js';
import { agregarFinanceiroPeriodo } from './financeiro.js';
import { renderizarGrafico } from './grafico.js';
import { calcularJanelaAnterior, calcularJanelaPeriodo } from './janela.js';
import { gerarPdfRelatorioMensal } from './pdfMensal.js';
import { agregarUsoIaPeriodo } from './usoIa.js';

export type RelatorioMensalPdf = {
  buffer: Buffer;
  nomeArquivo: string;
};

// Núcleo do relatório mensal em PDF, compartilhado entre o job automático
// (scripts/relatorioMensal.ts, roda no dia 1 pro mês que fechou ontem) e a
// tool de chat relatorio(periodo="mes") (ai/tools/relatorios.ts, roda sob
// demanda pro mês atual) — mesma lógica, só muda o `agora` de referência.
// Chama a IA de novo a cada execução (inclusive via chat), a pedido
// explícito do usuário (2026-09-22): quer o resumo narrado sempre presente,
// mesmo pagando o custo extra de uma chamada por pedido no chat.
export async function gerarRelatorioMensalCompleto(db: DbClient, client: OpenAI, agora: Date = new Date()): Promise<RelatorioMensalPdf> {
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
