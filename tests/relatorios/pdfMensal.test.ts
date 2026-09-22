import { createCanvas } from 'canvas';
import { describe, expect, it } from 'vitest';
import { gerarPdfRelatorioMensal } from '../../src/relatorios/pdfMensal.js';
import type { DadosRelatorio } from '../../src/relatorios/formatar.js';

function dados(overrides: Partial<DadosRelatorio> = {}): DadosRelatorio {
  return {
    inicio: '2026-09-01',
    fim: '2026-09-30',
    financeiro: {
      totalReceita: 5000,
      totalDespesa: 3200,
      porCategoria: [{ categoria: 'Mercado', totalReceita: 0, totalDespesa: 800 }],
      porConta: [{ apelido: 'Nubank', totalReceita: 5000, totalDespesa: 3200, saldoAtual: 1800 }],
      saldoConsolidado: 1800,
    },
    usoIa: {
      porFluxoModelo: [
        { fluxo: 'relatorio_mensal', modelo: 'x/y', tokensPrompt: 100, tokensCompletion: 50, custoEstimado: 0.002 },
      ],
      totalTokensPrompt: 100,
      totalTokensCompletion: 50,
      totalCustoEstimado: 0.002,
      interacoesIncorretas: 0,
      metrica1: [],
      metrica2: [],
      metrica3: [],
    },
    errosTecnicos: 0,
    ...overrides,
  };
}

function pngDeTeste(): Buffer {
  return createCanvas(10, 10).toBuffer('image/png');
}

describe('gerarPdfRelatorioMensal', () => {
  it('gera um buffer PDF válido com os dois gráficos embutidos', async () => {
    const buffer = await gerarPdfRelatorioMensal(dados(), 'Resumo curto do mês.', pngDeTeste(), pngDeTeste());

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.toString('latin1')).toContain('%%EOF');
  });

  it('sem nenhum gráfico ainda gera PDF válido, só com as seções de texto', async () => {
    const semTransacao = dados({
      financeiro: { totalReceita: 0, totalDespesa: 0, porCategoria: [], porConta: [], saldoConsolidado: 0 },
    });

    const buffer = await gerarPdfRelatorioMensal(semTransacao, 'Sem movimentação neste mês.', undefined, undefined);

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.toString('latin1')).toContain('%%EOF');
  });

  it('PDF com gráficos é sensivelmente maior que sem gráficos', async () => {
    const semGrafico = await gerarPdfRelatorioMensal(dados(), 'Resumo.', undefined, undefined);
    const comGraficos = await gerarPdfRelatorioMensal(dados(), 'Resumo.', pngDeTeste(), pngDeTeste());

    expect(comGraficos.length).toBeGreaterThan(semGrafico.length);
  });

  it('texto longo de resumoTexto não trava nem lança exceção', async () => {
    const resumoLongo = 'Lorem ipsum dolor sit amet. '.repeat(500);

    const buffer = await gerarPdfRelatorioMensal(dados(), resumoLongo, undefined, undefined);

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
