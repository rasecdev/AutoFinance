export type SistemaAmortizacao = 'price' | 'sac';
export type ModoAmortizacao = 'reduzir_parcelas' | 'reduzir_valor';

export type ParametrosAmortizacao = {
  sistema: SistemaAmortizacao;
  saldoDevedor: number;
  taxaJuros: number;
  parcelasRestantes: number;
  valorAmortizado: number;
  modo: ModoAmortizacao;
};

export type ResultadoAmortizacao =
  | { modo: 'reduzir_parcelas'; novoNumeroParcelas: number }
  | { modo: 'reduzir_valor'; novoValorParcela: number };

function parcelaPrice(saldo: number, taxa: number, parcelas: number): number {
  if (parcelas <= 0) return 0;
  if (taxa === 0) return saldo / parcelas;
  return (saldo * taxa) / (1 - (1 + taxa) ** -parcelas);
}

function numeroParcelasPrice(saldo: number, taxa: number, valorParcela: number): number {
  if (saldo <= 0 || valorParcela <= 0) return 0;
  if (taxa === 0) return Math.ceil(saldo / valorParcela);
  return Math.ceil(-Math.log(1 - (saldo * taxa) / valorParcela) / Math.log(1 + taxa));
}

export function calcularAmortizacao(params: ParametrosAmortizacao): ResultadoAmortizacao {
  const { sistema, saldoDevedor, taxaJuros, parcelasRestantes, valorAmortizado, modo } = params;
  const novoSaldo = Math.max(saldoDevedor - valorAmortizado, 0);

  if (sistema === 'price') {
    if (modo === 'reduzir_valor') {
      return { modo, novoValorParcela: parcelaPrice(novoSaldo, taxaJuros, parcelasRestantes) };
    }
    const parcelaOriginal = parcelaPrice(saldoDevedor, taxaJuros, parcelasRestantes);
    return { modo, novoNumeroParcelas: numeroParcelasPrice(novoSaldo, taxaJuros, parcelaOriginal) };
  }

  // SAC: amortização constante = saldo / parcelas restantes; juro decrescente sobre o saldo.
  const amortizacaoConstante = parcelasRestantes > 0 ? saldoDevedor / parcelasRestantes : 0;

  if (modo === 'reduzir_parcelas') {
    const novoNumeroParcelas = amortizacaoConstante > 0 ? Math.ceil(novoSaldo / amortizacaoConstante) : 0;
    return { modo, novoNumeroParcelas };
  }

  const novaAmortizacaoConstante = parcelasRestantes > 0 ? novoSaldo / parcelasRestantes : 0;
  const novoValorParcela = novaAmortizacaoConstante + novoSaldo * taxaJuros;
  return { modo, novoValorParcela };
}
