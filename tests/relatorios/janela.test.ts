import { describe, expect, it } from 'vitest';
import { calcularJanelaAnterior, calcularJanelaPeriodo } from '../../src/relatorios/janela.js';

describe('calcularJanelaPeriodo', () => {
  it('dia: início e fim são a mesma data de referência', () => {
    const janela = calcularJanelaPeriodo('dia', new Date(2026, 2, 15)); // 2026-03-15 (domingo)

    expect(janela).toEqual({ inicio: '2026-03-15', fim: '2026-03-15' });
  });

  it('semana: segunda a domingo contendo a data de referência (referência é quarta)', () => {
    const janela = calcularJanelaPeriodo('semana', new Date(2026, 2, 18)); // 2026-03-18 é quarta

    expect(janela).toEqual({ inicio: '2026-03-16', fim: '2026-03-22' });
  });

  it('semana: referência caindo num domingo ainda pertence à semana que termina nesse domingo', () => {
    const janela = calcularJanelaPeriodo('semana', new Date(2026, 2, 22)); // 2026-03-22 é domingo

    expect(janela).toEqual({ inicio: '2026-03-16', fim: '2026-03-22' });
  });

  it('semana: referência caindo numa segunda é o início da semana', () => {
    const janela = calcularJanelaPeriodo('semana', new Date(2026, 2, 16)); // 2026-03-16 é segunda

    expect(janela).toEqual({ inicio: '2026-03-16', fim: '2026-03-22' });
  });

  it('mes: primeiro ao último dia do mês da data de referência', () => {
    const janela = calcularJanelaPeriodo('mes', new Date(2026, 1, 10)); // fevereiro de 2026 (não bissexto)

    expect(janela).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' });
  });

  it('mes: considera ano bissexto corretamente', () => {
    const janela = calcularJanelaPeriodo('mes', new Date(2028, 1, 10)); // fevereiro de 2028 (bissexto)

    expect(janela).toEqual({ inicio: '2028-02-01', fim: '2028-02-29' });
  });
});

describe('calcularJanelaAnterior', () => {
  it('dia: desloca 1 dia pra trás', () => {
    expect(calcularJanelaAnterior('dia', { inicio: '2026-03-15', fim: '2026-03-15' })).toEqual({
      inicio: '2026-03-14',
      fim: '2026-03-14',
    });
  });

  it('semana: desloca 7 dias pra trás', () => {
    expect(calcularJanelaAnterior('semana', { inicio: '2026-03-16', fim: '2026-03-22' })).toEqual({
      inicio: '2026-03-09',
      fim: '2026-03-15',
    });
  });

  it('mes: mês anterior inteiro, mesmo virando ano', () => {
    expect(calcularJanelaAnterior('mes', { inicio: '2026-01-01', fim: '2026-01-31' })).toEqual({
      inicio: '2025-12-01',
      fim: '2025-12-31',
    });
  });

  it('mes: mês anterior com número de dias diferente (respeita ano bissexto)', () => {
    expect(calcularJanelaAnterior('mes', { inicio: '2028-03-01', fim: '2028-03-31' })).toEqual({
      inicio: '2028-02-01',
      fim: '2028-02-29',
    });
  });
});
