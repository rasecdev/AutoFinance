import { describe, expect, it } from 'vitest';
import { calcularJanelaPeriodo } from '../../src/relatorios/janela.js';

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
