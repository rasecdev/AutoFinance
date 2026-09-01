import { describe, expect, it } from 'vitest';
import { calcularAmortizacao } from '../../src/finance/amortizacao.js';

describe('calcularAmortizacao — Price', () => {
  it('reduzir_valor, taxa zero: divisão simples do saldo restante', () => {
    const resultado = calcularAmortizacao({
      sistema: 'price',
      saldoDevedor: 12000,
      taxaJuros: 0,
      parcelasRestantes: 12,
      valorAmortizado: 2000,
      modo: 'reduzir_valor',
    });

    expect(resultado).toEqual({ modo: 'reduzir_valor', novoValorParcela: 10000 / 12 });
  });

  it('reduzir_parcelas, taxa zero: divisão simples pela parcela original', () => {
    const resultado = calcularAmortizacao({
      sistema: 'price',
      saldoDevedor: 12000,
      taxaJuros: 0,
      parcelasRestantes: 12,
      valorAmortizado: 3000,
      modo: 'reduzir_parcelas',
    });

    // parcela original = 12000/12 = 1000; saldo restante 9000 / 1000 = 9 parcelas
    expect(resultado).toEqual({ modo: 'reduzir_parcelas', novoNumeroParcelas: 9 });
  });

  it('reduzir_valor, uma parcela restante: PMT = saldo * (1 + taxa)', () => {
    const resultado = calcularAmortizacao({
      sistema: 'price',
      saldoDevedor: 1000,
      taxaJuros: 0.02,
      parcelasRestantes: 1,
      valorAmortizado: 200,
      modo: 'reduzir_valor',
    });

    expect(resultado.modo).toBe('reduzir_valor');
    expect((resultado as { novoValorParcela: number }).novoValorParcela).toBeCloseTo(816, 6);
  });

  it('reduzir_valor, caso geral com juros: PMT reproduz o saldo pela fórmula de valor presente da anuidade', () => {
    const saldoDevedor = 50000;
    const taxaJuros = 0.015;
    const parcelasRestantes = 24;
    const valorAmortizado = 10000;
    const novoSaldo = saldoDevedor - valorAmortizado;

    const resultado = calcularAmortizacao({
      sistema: 'price',
      saldoDevedor,
      taxaJuros,
      parcelasRestantes,
      valorAmortizado,
      modo: 'reduzir_valor',
    });

    const pmt = (resultado as { novoValorParcela: number }).novoValorParcela;
    const valorPresenteReconstruido = (pmt * (1 - (1 + taxaJuros) ** -parcelasRestantes)) / taxaJuros;
    expect(valorPresenteReconstruido).toBeCloseTo(novoSaldo, 4);
  });

  it('reduzir_parcelas, caso geral com juros: parcela original paga o novo saldo em torno do número de parcelas devolvido', () => {
    const saldoDevedor = 50000;
    const taxaJuros = 0.015;
    const parcelasRestantes = 24;
    const valorAmortizado = 10000;
    const novoSaldo = saldoDevedor - valorAmortizado;
    const pmtOriginal = (saldoDevedor * taxaJuros) / (1 - (1 + taxaJuros) ** -parcelasRestantes);

    const resultado = calcularAmortizacao({
      sistema: 'price',
      saldoDevedor,
      taxaJuros,
      parcelasRestantes,
      valorAmortizado,
      modo: 'reduzir_parcelas',
    });

    const n = (resultado as { novoNumeroParcelas: number }).novoNumeroParcelas;
    const valorPresenteReconstruido = (pmtOriginal * (1 - (1 + taxaJuros) ** -n)) / taxaJuros;
    // n foi arredondado pra cima, então a anuidade reconstruída cobre um pouco mais que o saldo
    expect(valorPresenteReconstruido).toBeGreaterThanOrEqual(novoSaldo - 0.01);
    expect(valorPresenteReconstruido).toBeLessThan(novoSaldo + pmtOriginal);
  });

  it('amortização quita a dívida (valor >= saldo devedor): 0 parcelas / parcela zero', () => {
    const base = { sistema: 'price' as const, saldoDevedor: 5000, taxaJuros: 0.01, parcelasRestantes: 10 };

    expect(
      calcularAmortizacao({ ...base, valorAmortizado: 5000, modo: 'reduzir_parcelas' }),
    ).toEqual({ modo: 'reduzir_parcelas', novoNumeroParcelas: 0 });
    expect(
      calcularAmortizacao({ ...base, valorAmortizado: 6000, modo: 'reduzir_valor' }),
    ).toEqual({ modo: 'reduzir_valor', novoValorParcela: 0 });
  });
});

describe('calcularAmortizacao — SAC', () => {
  it('reduzir_parcelas, taxa zero: divisão simples pela amortização constante', () => {
    const resultado = calcularAmortizacao({
      sistema: 'sac',
      saldoDevedor: 12000,
      taxaJuros: 0,
      parcelasRestantes: 12,
      valorAmortizado: 3000,
      modo: 'reduzir_parcelas',
    });

    // amortização constante = 12000/12 = 1000; saldo restante 9000 / 1000 = 9 parcelas
    expect(resultado).toEqual({ modo: 'reduzir_parcelas', novoNumeroParcelas: 9 });
  });

  it('reduzir_valor, caso geral: amortização constante recalculada + juros sobre o novo saldo', () => {
    const resultado = calcularAmortizacao({
      sistema: 'sac',
      saldoDevedor: 12000,
      taxaJuros: 0.01,
      parcelasRestantes: 12,
      valorAmortizado: 2000,
      modo: 'reduzir_valor',
    });

    // novo saldo 10000; amortização 10000/12; juros 10000*0.01=100
    expect(resultado).toEqual({ modo: 'reduzir_valor', novoValorParcela: 10000 / 12 + 100 });
  });

  it('reduzir_valor, uma parcela restante: converge pra mesma fórmula do Price (amortização = saldo inteiro)', () => {
    const resultado = calcularAmortizacao({
      sistema: 'sac',
      saldoDevedor: 1000,
      taxaJuros: 0.02,
      parcelasRestantes: 1,
      valorAmortizado: 200,
      modo: 'reduzir_valor',
    });

    expect((resultado as { novoValorParcela: number }).novoValorParcela).toBeCloseTo(816, 6);
  });

  it('amortização quita a dívida (valor >= saldo devedor): 0 parcelas / parcela zero', () => {
    const base = { sistema: 'sac' as const, saldoDevedor: 5000, taxaJuros: 0.01, parcelasRestantes: 10 };

    expect(
      calcularAmortizacao({ ...base, valorAmortizado: 5000, modo: 'reduzir_parcelas' }),
    ).toEqual({ modo: 'reduzir_parcelas', novoNumeroParcelas: 0 });
    expect(
      calcularAmortizacao({ ...base, valorAmortizado: 6000, modo: 'reduzir_valor' }),
    ).toEqual({ modo: 'reduzir_valor', novoValorParcela: 0 });
  });
});
