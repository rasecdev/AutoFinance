import { createCanvas, loadImage } from 'canvas';
import type { DbClient } from '../db/client.js';
import { montarDadosDespesaPorCategoria } from './dadosGrafico.js';
import { agregarFinanceiroPeriodo } from './financeiro.js';
import { formatarDelta } from './formatarDelta.js';
import { renderizarGrafico } from './grafico.js';
import { calcularJanelaAnterior, calcularJanelaPeriodo } from './janela.js';
import { agregarUsoIaPeriodo } from './usoIa.js';

const LARGURA = 800;
const ALTURA_CABECALHO_FAIXA = 90;
const ALTURA_CABECALHO = 340;
const ALTURA_GRAFICO = 500;
const MARGEM = 40;

// Mesma paleta de pdfMensal.ts (COR_PRIMARIA/COR_ACENTO/COR_RECEITA/
// COR_DESPESA) — os dois relatórios (semanal em imagem, mensal em PDF)
// devem se ler como o mesmo produto, não dois estilos diferentes.
const COR_PRIMARIA = '#1f2d3d';
const COR_ACENTO = '#4e79a7';
const COR_RECEITA = '#2e7d32';
const COR_DESPESA = '#c62828';
const COR_TEXTO = '#1a1a1a';
const COR_TEXTO_MUTED = '#64748b';
const COR_CARD_FUNDO = '#f8fafc';

function formatarMoeda(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  // Faixa de marca — mesmo COR_PRIMARIA do header do PDF mensal, pra ler
  // como o mesmo produto em vez de dois estilos diferentes.
  ctx.fillStyle = COR_PRIMARIA;
  ctx.fillRect(0, 0, LARGURA, ALTURA_CABECALHO_FAIXA);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('AUTOFINANCE — RELATÓRIO SEMANAL', MARGEM, 34);
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`${janelaAtual.inicio} a ${janelaAtual.fim}`, MARGEM, 62);

  const colunas = [
    { rotulo: 'Receita', valor: financeiro.totalReceita, delta: financeiro.totalReceita - financeiroAnterior.totalReceita, cor: COR_RECEITA },
    { rotulo: 'Despesa', valor: financeiro.totalDespesa, delta: financeiro.totalDespesa - financeiroAnterior.totalDespesa, cor: COR_DESPESA },
    {
      rotulo: 'Saldo consolidado',
      valor: financeiro.saldoConsolidado,
      delta: undefined,
      cor: financeiro.saldoConsolidado >= 0 ? COR_RECEITA : COR_DESPESA,
    },
  ];
  const larguraCartao = (LARGURA - 2 * MARGEM - 2 * 12) / colunas.length;
  const yCartoes = ALTURA_CABECALHO_FAIXA + 24;
  const alturaCartao = 92;

  colunas.forEach((coluna, indice) => {
    const x = MARGEM + indice * (larguraCartao + 12);

    ctx.fillStyle = COR_CARD_FUNDO;
    ctx.fillRect(x, yCartoes, larguraCartao, alturaCartao);
    ctx.fillStyle = coluna.cor;
    ctx.fillRect(x, yCartoes, 4, alturaCartao);

    ctx.font = '11px sans-serif';
    ctx.fillStyle = COR_TEXTO_MUTED;
    ctx.fillText(coluna.rotulo.toUpperCase(), x + 16, yCartoes + 22);
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = COR_TEXTO;
    ctx.fillText(formatarMoeda(coluna.valor), x + 16, yCartoes + 52);

    if (coluna.delta !== undefined) {
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = coluna.delta >= 0 ? COR_RECEITA : COR_DESPESA;
      ctx.fillText(formatarDelta(coluna.delta), x + 16, yCartoes + 72);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = COR_TEXTO_MUTED;
      ctx.fillText('vs. semana anterior', x + 16, yCartoes + 86);
    }
  });

  const yCustoIa = yCartoes + alturaCartao + 30;
  ctx.font = '15px sans-serif';
  ctx.fillStyle = COR_TEXTO_MUTED;
  ctx.fillText(`Custo de IA no período: US$ ${usoIa.totalCustoEstimado.toFixed(6)}`, MARGEM, yCustoIa);

  const ySecaoGrafico = yCustoIa + 30;
  ctx.fillStyle = COR_ACENTO;
  ctx.fillRect(MARGEM, ySecaoGrafico - 11, 4, 14);
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = COR_PRIMARIA;
  ctx.fillText('Despesa por categoria', MARGEM + 12, ySecaoGrafico);

  if (graficoBuffer) {
    const imagemGrafico = await loadImage(graficoBuffer);
    ctx.drawImage(imagemGrafico, 0, ALTURA_CABECALHO, LARGURA, ALTURA_GRAFICO);
  } else {
    ctx.font = '15px sans-serif';
    ctx.fillStyle = COR_TEXTO_MUTED;
    ctx.fillText('Nenhuma despesa no período.', MARGEM, ALTURA_CABECALHO + 30);
  }

  return canvas.toBuffer('image/png');
}
