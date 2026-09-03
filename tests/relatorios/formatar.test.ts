import { describe, expect, it } from 'vitest';
import { formatarRelatorio } from '../../src/relatorios/formatar.js';

const financeiroVazio = { totalReceita: 0, totalDespesa: 0, porCategoria: [], saldoConsolidado: 500 };
const usoIaVazio = {
  porFluxoModelo: [],
  totalTokensPrompt: 0,
  totalTokensCompletion: 0,
  totalCustoEstimado: 0,
  interacoesIncorretas: 0,
  metrica1: [],
};

describe('formatarRelatorio', () => {
  it('cabeçalho de um único dia mostra só a data', () => {
    const texto = formatarRelatorio({ inicio: '2026-03-15', fim: '2026-03-15', financeiro: financeiroVazio, usoIa: usoIaVazio });

    expect(texto).toContain('2026-03-15');
    expect(texto).not.toContain('a 2026-03-15');
  });

  it('cabeçalho de um intervalo mostra início e fim', () => {
    const texto = formatarRelatorio({ inicio: '2026-03-01', fim: '2026-03-31', financeiro: financeiroVazio, usoIa: usoIaVazio });

    expect(texto).toContain('2026-03-01 a 2026-03-31');
  });

  it('mostra "nenhuma transação" quando não há dado financeiro', () => {
    const texto = formatarRelatorio({ inicio: '2026-03-15', fim: '2026-03-15', financeiro: financeiroVazio, usoIa: usoIaVazio });

    expect(texto).toContain('Nenhuma transação no período.');
    expect(texto).toContain('R$ 500.00');
  });

  it('mostra receita/despesa por categoria quando há dado', () => {
    const texto = formatarRelatorio({
      inicio: '2026-03-15',
      fim: '2026-03-15',
      financeiro: {
        totalReceita: 1000,
        totalDespesa: 50,
        porCategoria: [{ categoria: 'transporte', totalReceita: 0, totalDespesa: 50 }],
        saldoConsolidado: 500,
      },
      usoIa: usoIaVazio,
    });

    expect(texto).toContain('R$ 1000.00');
    expect(texto).toContain('transporte');
    expect(texto).toContain('R$ 50.00');
  });

  it('mostra "nenhum uso de IA" quando não há dado', () => {
    const texto = formatarRelatorio({ inicio: '2026-03-15', fim: '2026-03-15', financeiro: financeiroVazio, usoIa: usoIaVazio });

    expect(texto).toContain('Nenhum uso de IA registrado no período.');
  });

  it('mostra tokens/custo por fluxo, incorretas e Métrica 1 quando presentes', () => {
    const texto = formatarRelatorio({
      inicio: '2026-03-15',
      fim: '2026-03-15',
      financeiro: financeiroVazio,
      usoIa: {
        porFluxoModelo: [
          { fluxo: 'conversa_texto', modelo: 'openai/gpt-4o-mini', tokensPrompt: 100, tokensCompletion: 20, custoEstimado: 0.01 },
        ],
        totalTokensPrompt: 100,
        totalTokensCompletion: 20,
        totalCustoEstimado: 0.01,
        interacoesIncorretas: 2,
        metrica1: [{ nomeExibicao: 'Claude Haiku', modelo: 'anthropic/claude-haiku-4.5', custoEstimado: 0.02 }],
      },
    });

    expect(texto).toContain('conversa_texto');
    expect(texto).toContain('120 tokens');
    expect(texto).toContain('Respostas marcadas como incorretas no período: 2');
    expect(texto).toContain('Claude Haiku');
  });

  it('não mostra linha de incorretas quando é zero', () => {
    const texto = formatarRelatorio({
      inicio: '2026-03-15',
      fim: '2026-03-15',
      financeiro: financeiroVazio,
      usoIa: {
        porFluxoModelo: [
          { fluxo: 'conversa_texto', modelo: 'openai/gpt-4o-mini', tokensPrompt: 100, tokensCompletion: 20, custoEstimado: 0.01 },
        ],
        totalTokensPrompt: 100,
        totalTokensCompletion: 20,
        totalCustoEstimado: 0.01,
        interacoesIncorretas: 0,
        metrica1: [],
      },
    });

    expect(texto).not.toContain('incorretas');
  });
});
