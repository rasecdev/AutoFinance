import { createCanvas, loadImage } from 'canvas';
import type { DbClient } from '../db/client.js';
import { montarDadosDespesaPorCategoria } from './dadosGrafico.js';
import { agregarFinanceiroPeriodo } from './financeiro.js';
import { formatarDelta } from './formatarDelta.js';
import { renderizarGrafico } from './grafico.js';
import { calcularJanelaAnterior, calcularJanelaPeriodo } from './janela.js';
import { agregarUsoIaPeriodo } from './usoIa.js';

const LARGURA = 800;
const ALTURA_CABECALHO = 340;
const ALTURA_GRAFICO = 500;
const MARGEM = 40;

function formatarMoeda(valor: number): string {
  return `R$ ${valor.toFixed(2)}`;
}

// Imagem semanal deliberadamente curada (Tarefa 117, ver tasks/plan.md):
// só o essencial pra ler de relance — receita/despesa/saldo com delta vs.
// semana anterior, custo total de IA e o gráfico de despesa por categoria.
// Por conta individual e uso de IA por fluxo/modelo saem do push (ficariam
// confusos numa imagem, mesmo motivo que tornou o texto confuso) — continuam
// disponíveis via relatorio(periodo=semana) no chat, sem mudança.
export async function montarImagemRelatorioSemanal(db: DbClient, agora: Date = new Date()): Promise<Buffer> {
  const janelaAtual = calcularJanelaPeriodo('semana', agora);
  const janelaAnterior = calcularJanelaAnterior('semana', janelaAtual);

  const financeiro = agregarFinanceiroPeriodo(db, janelaAtual);
  const financeiroAnterior = agregarFinanceiroPeriodo(db, janelaAnterior);
  const usoIa = agregarUsoIaPeriodo(db, janelaAtual);

  const dadosGrafico = montarDadosDespesaPorCategoria(financeiro.porCategoria);
  const graficoBuffer = dadosGrafico.length > 0 ? await renderizarGrafico('pizza', dadosGrafico) : undefined;

  const altura = ALTURA_CABECALHO + (graficoBuffer ? ALTURA_GRAFICO : 60);
  const canvas = createCanvas(LARGURA, altura);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, LARGURA, altura);
  ctx.fillStyle = '#1a1a1a';

  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(`Relatório semanal — ${janelaAtual.inicio} a ${janelaAtual.fim}`, MARGEM, 50);

  const colunas = [
    { rotulo: 'Receita', valor: financeiro.totalReceita, delta: financeiro.totalReceita - financeiroAnterior.totalReceita },
    { rotulo: 'Despesa', valor: financeiro.totalDespesa, delta: financeiro.totalDespesa - financeiroAnterior.totalDespesa },
    { rotulo: 'Saldo consolidado', valor: financeiro.saldoConsolidado, delta: undefined },
  ];
  const larguraColuna = (LARGURA - 2 * MARGEM) / colunas.length;

  colunas.forEach((coluna, indice) => {
    const x = MARGEM + indice * larguraColuna;
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#555555';
    ctx.fillText(coluna.rotulo, x, 110);
    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = '#1a1a1a';
    ctx.fillText(formatarMoeda(coluna.valor), x, 150);
    if (coluna.delta !== undefined) {
      // Achado real de teste manual (2026-09-22): "R$ -600.00 vs. semana
      // anterior" numa linha só é mais largo que a coluna (240px) e vaza
      // por cima da coluna vizinha — quebrado em 2 linhas, valor maior +
      // legenda menor, cada uma cabendo à vontade na largura da coluna.
      ctx.font = 'bold 16px sans-serif';
      ctx.fillStyle = coluna.delta >= 0 ? '#2e7d32' : '#c62828';
      ctx.fillText(formatarDelta(coluna.delta), x, 175);
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#777777';
      ctx.fillText('vs. semana anterior', x, 192);
    }
  });

  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#555555';
  ctx.fillText(
    `Custo de IA no período: US$ ${usoIa.totalCustoEstimado.toFixed(6)}`,
    MARGEM,
    230,
  );

  if (graficoBuffer) {
    const imagemGrafico = await loadImage(graficoBuffer);
    ctx.drawImage(imagemGrafico, 0, ALTURA_CABECALHO, LARGURA, ALTURA_GRAFICO);
  } else {
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#555555';
    ctx.fillText('Nenhuma despesa no período.', MARGEM, ALTURA_CABECALHO + 30);
  }

  return canvas.toBuffer('image/png');
}
