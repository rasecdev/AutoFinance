import { describe, expect, it } from 'vitest';
import { calcularProximoDia1DoMesAs23h } from '../../src/scripts/relatorioMensal.js';

describe('calcularProximoDia1DoMesAs23h', () => {
  it('meio do mês: calcula o dia 1 do mês seguinte às 23h', () => {
    const resultado = calcularProximoDia1DoMesAs23h(new Date(2026, 2, 10, 10, 0)); // 10/mar/2026

    expect(resultado).toEqual(new Date(2026, 3, 1, 23, 0, 0, 0));
  });

  it('dia 1 do mês antes das 23h: dispara hoje às 23h', () => {
    const resultado = calcularProximoDia1DoMesAs23h(new Date(2026, 1, 1, 10, 0)); // 01/fev/2026

    expect(resultado).toEqual(new Date(2026, 1, 1, 23, 0, 0, 0));
  });

  it('dia 1 do mês depois das 23h: dispara no dia 1 do mês seguinte', () => {
    const resultado = calcularProximoDia1DoMesAs23h(new Date(2026, 1, 1, 23, 30));

    expect(resultado).toEqual(new Date(2026, 2, 1, 23, 0, 0, 0));
  });

  it('respeita virada de ano', () => {
    const resultado = calcularProximoDia1DoMesAs23h(new Date(2026, 11, 1, 23, 30)); // 01/dez depois das 23h

    expect(resultado).toEqual(new Date(2027, 0, 1, 23, 0, 0, 0));
  });
});
