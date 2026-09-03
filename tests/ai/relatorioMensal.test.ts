import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { MODELO_RELATORIO_MENSAL, gerarResumoMensal } from '../../src/ai/relatorioMensal.js';
import type { AgregacaoFinanceira } from '../../src/relatorios/financeiro.js';
import type { AgregacaoUsoIa } from '../../src/relatorios/usoIa.js';

function criarClienteFalso(resumoTexto: string) {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: resumoTexto } }],
    usage: { prompt_tokens: 80, completion_tokens: 30 },
  });
  return { client: { chat: { completions: { create } } } as unknown as OpenAI, create };
}

const financeiroVazio: AgregacaoFinanceira = {
  totalReceita: 0,
  totalDespesa: 0,
  porCategoria: [],
  saldoConsolidado: 0,
};

const usoIaVazio: AgregacaoUsoIa = {
  porFluxoModelo: [],
  totalTokensPrompt: 0,
  totalTokensCompletion: 0,
  totalCustoEstimado: 0,
  interacoesIncorretas: 0,
  metrica1: [],
};

describe('gerarResumoMensal', () => {
  it('envia os dados pré-calculados no prompt e devolve o texto narrado pelo modelo', async () => {
    const { client, create } = criarClienteFalso('Mês positivo, com destaque para a categoria alimentação.');

    const resultado = await gerarResumoMensal(client, {
      inicio: '2026-03-01',
      fim: '2026-03-31',
      financeiro: {
        totalReceita: 5000,
        totalDespesa: 3000,
        porCategoria: [{ categoria: 'alimentacao', totalReceita: 0, totalDespesa: 1200 }],
        saldoConsolidado: 2000,
      },
      usoIa: usoIaVazio,
      financeiroAnterior: financeiroVazio,
      usoIaAnterior: usoIaVazio,
    });

    expect(resultado).toEqual({
      resumoTexto: 'Mês positivo, com destaque para a categoria alimentação.',
      tokensPrompt: 80,
      tokensCompletion: 30,
    });

    const mensagensEnviadas = create.mock.calls[0]?.[0]?.messages;
    expect(mensagensEnviadas[0].content).toContain('nunca some, subtraia');
    expect(mensagensEnviadas[1].content).toContain('"totalReceita": 5000');
    expect(mensagensEnviadas[1].content).toContain('alimentacao');
    expect(create.mock.calls[0]?.[0]?.model).toBe(MODELO_RELATORIO_MENSAL);
  });

  it('usa o modelo passado explicitamente em vez do padrão', async () => {
    const { client, create } = criarClienteFalso('resumo');

    await gerarResumoMensal(
      client,
      { inicio: '2026-03-01', fim: '2026-03-31', financeiro: financeiroVazio, usoIa: usoIaVazio, financeiroAnterior: financeiroVazio, usoIaAnterior: usoIaVazio },
      'qwen/qwen3-32b',
    );

    expect(create.mock.calls[0]?.[0]?.model).toBe('qwen/qwen3-32b');
  });
});
