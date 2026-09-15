import type { DbClient } from '../client.js';
import { buscarFaturaPorCartaoEMes, type Fatura } from './faturas.js';
import { listarParcelasPendentes, obterParcelaPorNumero, type Parcela } from './parcelas.js';

export function encontrarFaturaCorrespondente(
  db: DbClient,
  args: { cartaoId: number; mesReferencia: string },
): Fatura | undefined {
  return buscarFaturaPorCartaoEMes(db, args.cartaoId, args.mesReferencia);
}

export type ResultadoCorrespondenciaParcela =
  | { tipo: 'encontrada'; parcela: Parcela }
  | { tipo: 'nao_encontrada' }
  | { tipo: 'ambigua'; candidatas: Parcela[] };

// Tolerância pra aproximação quando o e-mail não traz o número da parcela
// (boleto avulso, por exemplo): ±1% de valor e ±5 dias de vencimento em
// relação às parcelas ainda pendentes da dívida. Mais de uma candidata dentro
// da tolerância é ambiguidade real — não escolhe sozinho, quem chama decide
// (pendência explícita pro usuário via confirmação).
const TOLERANCIA_VALOR_FRACAO = 0.01;
const JANELA_DATA_MS = 5 * 24 * 60 * 60 * 1000;

export function encontrarParcelaCorrespondente(
  db: DbClient,
  args: { dividaId: number; numeroParcela?: number; valor: number; dataVencimento: string },
): ResultadoCorrespondenciaParcela {
  if (args.numeroParcela !== undefined) {
    const parcela = obterParcelaPorNumero(db, args.dividaId, args.numeroParcela);
    return parcela ? { tipo: 'encontrada', parcela } : { tipo: 'nao_encontrada' };
  }

  const alvoMs = new Date(args.dataVencimento).getTime();

  const candidatas = listarParcelasPendentes(db, args.dividaId).filter((parcela) => {
    const dentroDoValor = Math.abs(parcela.valor - args.valor) <= args.valor * TOLERANCIA_VALOR_FRACAO;
    const dentroDaJanela = Math.abs(new Date(parcela.dataVencimento).getTime() - alvoMs) <= JANELA_DATA_MS;
    return dentroDoValor && dentroDaJanela;
  });

  if (candidatas.length === 0) {
    return { tipo: 'nao_encontrada' };
  }

  const [unica] = candidatas;
  if (candidatas.length === 1 && unica) {
    return { tipo: 'encontrada', parcela: unica };
  }

  return { tipo: 'ambigua', candidatas };
}
