import { describe, expect, it } from 'vitest';
import { formatarRelatorio } from '../../src/relatorios/formatar.js';

const financeiroVazio = { totalReceita: 0, totalDespesa: 0, porCategoria: [], porConta: [], saldoConsolidado: 500 };
const usoIaVazio = {
  porFluxoModelo: [],
  totalTokensPrompt: 0,
  totalTokensCompletion: 0,
  totalCustoEstimado: 0,
  interacoesIncorretas: 0,
  metrica1: [],
  metrica2: [],
  metrica3: [],
};

describe('formatarRelatorio', () => {
  it('cabeçalho de um único dia mostra só a data', () => {
    const texto = formatarRelatorio({
      inicio: '2026-03-15',
      fim: '2026-03-15',
      financeiro: financeiroVazio,
      usoIa: usoIaVazio,
      errosTecnicos: 0,
    });

    expect(texto).toContain('2026-03-15');
    expect(texto).not.toContain('a 2026-03-15');
  });

  it('cabeçalho de um intervalo mostra início e fim', () => {
    const texto = formatarRelatorio({
      inicio: '2026-03-01',
      fim: '2026-03-31',
      financeiro: financeiroVazio,
      usoIa: usoIaVazio,
      errosTecnicos: 0,
    });

    expect(texto).toContain('2026-03-01 a 2026-03-31');
  });

  it('mostra "nenhuma transação" quando não há dado financeiro', () => {
    const texto = formatarRelatorio({
      inicio: '2026-03-15',
      fim: '2026-03-15',
      financeiro: financeiroVazio,
      usoIa: usoIaVazio,
      errosTecnicos: 0,
    });

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
        porConta: [],
        saldoConsolidado: 500,
      },
      usoIa: usoIaVazio,
      errosTecnicos: 0,
    });

    expect(texto).toContain('R$ 1000.00');
    expect(texto).toContain('transporte');
    expect(texto).toContain('R$ 50.00');
  });

  it('mostra a discriminação por conta quando há mais de uma conta', () => {
    const texto = formatarRelatorio({
      inicio: '2026-03-15',
      fim: '2026-03-15',
      financeiro: {
        totalReceita: 1500,
        totalDespesa: 50,
        porCategoria: [],
        porConta: [
          { apelido: 'Principal', totalReceita: 0, totalDespesa: 50, saldoAtual: 70 },
          { apelido: 'Poupança', totalReceita: 1500, totalDespesa: 0, saldoAtual: 1750 },
        ],
        saldoConsolidado: 1820,
      },
      usoIa: usoIaVazio,
      errosTecnicos: 0,
    });

    expect(texto).toContain('Por conta:');
    expect(texto).toContain('Principal: receita R$ 0.00, despesa R$ 50.00, saldo atual R$ 70.00');
    expect(texto).toContain('Poupança: receita R$ 1500.00, despesa R$ 0.00, saldo atual R$ 1750.00');
    expect(texto).toContain('Saldo consolidado (todas as contas): R$ 1820.00');
  });

  it('não mostra a seção "Por conta" quando porConta está vazio', () => {
    const texto = formatarRelatorio({
      inicio: '2026-03-15',
      fim: '2026-03-15',
      financeiro: financeiroVazio,
      usoIa: usoIaVazio,
      errosTecnicos: 0,
    });

    expect(texto).not.toContain('Por conta:');
  });

  it('mostra "nenhum uso de IA" quando não há dado', () => {
    const texto = formatarRelatorio({
      inicio: '2026-03-15',
      fim: '2026-03-15',
      financeiro: financeiroVazio,
      usoIa: usoIaVazio,
      errosTecnicos: 0,
    });

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
        metrica2: [],
        metrica3: [],
      },
      errosTecnicos: 0,
    });

    expect(texto).toContain('conversa_texto');
    expect(texto).toContain('120 tokens');
    expect(texto).toContain('Respostas marcadas como incorretas no período: 2');
    expect(texto).toContain('Claude Haiku');
    // Custo de IA vem em créditos OpenRouter (1 crédito = 1 USD) — nunca "R$"
    // (achado real: usuário comparando com openrouter.ai/settings/profile, que é USD).
    expect(texto).toContain('US$ 0.010000');
    expect(texto).toContain('US$ 0.020000');
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
        metrica2: [],
        metrica3: [],
      },
      errosTecnicos: 0,
    });

    expect(texto).not.toContain('incorretas');
  });

  it('mostra a Métrica 3 (benchmark do modelo real em uso) quando presente', () => {
    const texto = formatarRelatorio({
      inicio: '2026-03-15',
      fim: '2026-03-15',
      financeiro: financeiroVazio,
      usoIa: {
        porFluxoModelo: [
          { fluxo: 'conversa_texto', modelo: 'openai/gpt-4o-mini', tokensPrompt: 100, tokensCompletion: 20, custoEstimado: 0.002341 },
        ],
        totalTokensPrompt: 100,
        totalTokensCompletion: 20,
        totalCustoEstimado: 0.002341,
        interacoesIncorretas: 0,
        metrica1: [],
        metrica2: [],
        metrica3: [
          {
            fluxo: 'conversa_texto',
            modelo: 'openai/gpt-4o-mini',
            custoEstimado: 0.002341,
            metrica: 'acuracia_tool_calling',
            valor: 1,
            fonteUrl: 'interno',
          },
        ],
      },
      errosTecnicos: 0,
    });

    expect(texto).toContain('Benchmark do modelo real em uso');
    expect(texto).toContain('conversa_texto (openai/gpt-4o-mini)');
    expect(texto).toContain('acuracia_tool_calling: 1');
    expect(texto).toContain('fonte: interno');
  });

  it('não mostra a seção da Métrica 3 quando vazia', () => {
    const texto = formatarRelatorio({
      inicio: '2026-03-15',
      fim: '2026-03-15',
      financeiro: financeiroVazio,
      usoIa: usoIaVazio,
      errosTecnicos: 0,
    });

    expect(texto).not.toContain('Benchmark do modelo real em uso');
  });

  it('mostra a Métrica 2 (custo ajustado) junto da linha de Métrica 1 do mesmo candidato', () => {
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
        metrica1: [{ nomeExibicao: 'Claude Haiku', modelo: 'anthropic/claude-haiku-4.5', custoEstimado: 0.02 }],
        metrica2: [
          {
            fluxo: 'conversa_texto',
            nomeExibicao: 'Claude Haiku',
            modelo: 'anthropic/claude-haiku-4.5',
            metrica: 'acuracia_tool_calling',
            custoAjustado: 0.04,
          },
        ],
        metrica3: [],
      },
      errosTecnicos: 0,
    });

    expect(texto).toContain('Claude Haiku');
    expect(texto).toContain('ajustado por acuracia_tool_calling em conversa_texto');
    expect(texto).toContain('US$ 0.040000');
    expect(texto).toContain('estimativa');
  });

  it('não mostra linha ajustada quando não há Métrica 2 pro candidato', () => {
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
        metrica1: [{ nomeExibicao: 'Claude Haiku', modelo: 'anthropic/claude-haiku-4.5', custoEstimado: 0.02 }],
        metrica2: [],
        metrica3: [],
      },
      errosTecnicos: 0,
    });

    expect(texto).not.toContain('ajustado por');
  });

  it('mostra a contagem de erros técnicos quando presente', () => {
    const texto = formatarRelatorio({
      inicio: '2026-03-15',
      fim: '2026-03-15',
      financeiro: financeiroVazio,
      usoIa: usoIaVazio,
      errosTecnicos: 3,
    });

    expect(texto).toContain('Erros técnicos no período: 3');
  });

  it('não mostra linha de erros técnicos quando é zero', () => {
    const texto = formatarRelatorio({
      inicio: '2026-03-15',
      fim: '2026-03-15',
      financeiro: financeiroVazio,
      usoIa: usoIaVazio,
      errosTecnicos: 0,
    });

    expect(texto).not.toContain('Erros técnicos');
  });

  it('mostra erros técnicos mesmo sem nenhum uso de IA no período (não fica escondido pelo early-return de usoIa)', () => {
    const texto = formatarRelatorio({
      inicio: '2026-03-15',
      fim: '2026-03-15',
      financeiro: financeiroVazio,
      usoIa: usoIaVazio,
      errosTecnicos: 1,
    });

    expect(texto).toContain('Nenhum uso de IA registrado no período.');
    expect(texto).toContain('Erros técnicos no período: 1');
  });
});
