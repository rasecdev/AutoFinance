import { describe, expect, it } from 'vitest';
import { calcularProximaSegundaAs23h } from '../../src/scripts/relatorioSemanal.js';

describe('calcularProximaSegundaAs23h', () => {
  it('quarta-feira: calcula a segunda seguinte às 23h', () => {
    const resultado = calcularProximaSegundaAs23h(new Date(2026, 2, 18, 10, 0)); // quarta

    expect(resultado).toEqual(new Date(2026, 2, 23, 23, 0, 0, 0));
  });

  it('segunda antes das 23h: dispara hoje às 23h', () => {
    const resultado = calcularProximaSegundaAs23h(new Date(2026, 2, 16, 20, 0)); // segunda

    expect(resultado).toEqual(new Date(2026, 2, 16, 23, 0, 0, 0));
  });

  it('segunda depois das 23h: dispara na segunda seguinte, não hoje de novo', () => {
    const resultado = calcularProximaSegundaAs23h(new Date(2026, 2, 16, 23, 30)); // segunda, 23h30

    expect(resultado).toEqual(new Date(2026, 2, 23, 23, 0, 0, 0));
  });

  it('segunda exatamente às 23h: já conta como passado, vai pra próxima', () => {
    const resultado = calcularProximaSegundaAs23h(new Date(2026, 2, 16, 23, 0, 0, 0));

    expect(resultado).toEqual(new Date(2026, 2, 23, 23, 0, 0, 0));
  });
});
