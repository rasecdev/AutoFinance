import type { DbClient } from '../db/client.js';
import { listarContas, obterConta } from '../db/repositories/contas.js';
import { listarDespesasFixasAtivas } from '../db/repositories/despesasFixas.js';
import { listarParcelasPendentesDividasAtivas } from '../db/repositories/dividas.js';
import { listarFaturasAbertas } from '../db/repositories/faturas.js';

export type EventoFluxoCaixa = { data: string; descricao: string; valor: number };

export type ResultadoProjecaoFluxoCaixa = {
  saldoAtual: number;
  saldoProjetado: number;
  eventos: EventoFluxoCaixa[];
  dataFicaNegativo: string | null;
};

function paraISODate(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

// mesReferencia é sempre "AAAA-MM" (ver normalizarMesReferencia) — a fatura
// vence no dia_vencimento do cartão DENTRO desse mesmo mês de referência
// (convenção já usada em todo o projeto: mes_referencia é o mês em que a
// fatura fecha/vence, não o mês da compra).
export function calcularDataVencimentoFatura(mesReferencia: string, diaVencimento: number): string {
  const [anoStr, mesStr] = mesReferencia.split('-');
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  return paraISODate(new Date(ano, mes - 1, diaVencimento));
}

// Próxima data em que "diaDoMes" ocorre a partir de "apartirDe" (inclusive o
// próprio dia) — mesmo princípio de dia_vencimento_esperado já usado em
// verificarDespesasFixas.ts, isolado aqui pra reaproveitar em
// projetarFluxoCaixa sem depender do módulo do job mensal.
export function calcularProximaOcorrenciaMensal(diaDoMes: number, apartirDe: Date): string {
  const anoBase = apartirDe.getFullYear();
  const mesBase = apartirDe.getMonth();
  const candidato = new Date(anoBase, mesBase, diaDoMes);

  if (candidato.getDate() >= apartirDe.getDate() && candidato.getMonth() === mesBase) {
    return paraISODate(candidato);
  }

  return paraISODate(new Date(anoBase, mesBase + 1, diaDoMes));
}

export function projetarFluxoCaixa(db: DbClient, dias: number, contaId?: number): ResultadoProjecaoFluxoCaixa {
  const hoje = new Date();
  const inicioISO = paraISODate(hoje);
  const fimISO = paraISODate(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dias));

  const dentroDaJanela = (data: string): boolean => data >= inicioISO && data <= fimISO;

  const saldoAtual =
    contaId !== undefined
      ? (obterConta(db, contaId)?.saldoAtual ?? 0)
      : listarContas(db).reduce((soma, conta) => soma + conta.saldoAtual, 0);

  const eventosParcelas: EventoFluxoCaixa[] = listarParcelasPendentesDividasAtivas(db, contaId)
    .filter((item) => dentroDaJanela(item.parcela.dataVencimento))
    .map((item) => ({
      data: item.parcela.dataVencimento,
      descricao: `Parcela ${item.parcela.numeroParcela} — ${item.dividaTipo}${item.dividaDescricao ? ` "${item.dividaDescricao}"` : ''}`,
      valor: item.parcela.valor,
    }));

  const eventosFaturas: EventoFluxoCaixa[] = listarFaturasAbertas(db, contaId)
    .map((fatura) => ({ fatura, data: calcularDataVencimentoFatura(fatura.mesReferencia, fatura.diaVencimento) }))
    .filter(({ data }) => dentroDaJanela(data))
    .map(({ fatura, data }) => ({
      data,
      descricao: `Fatura de cartão (${fatura.mesReferencia})`,
      valor: fatura.valor,
    }));

  const eventosDespesasFixas: EventoFluxoCaixa[] = listarDespesasFixasAtivas(db)
    .filter((despesa) => despesa.cartaoId === null && (contaId === undefined || despesa.contaId === contaId))
    .map((despesa) => ({ despesa, data: calcularProximaOcorrenciaMensal(despesa.diaVencimentoEsperado, hoje) }))
    .filter(({ data }) => dentroDaJanela(data))
    .map(({ despesa, data }) => ({ data, descricao: despesa.descricao, valor: despesa.valorEsperado }));

  const eventos = [...eventosParcelas, ...eventosFaturas, ...eventosDespesasFixas].sort((a, b) =>
    a.data.localeCompare(b.data),
  );

  let acumulado = saldoAtual;
  let dataFicaNegativo: string | null = null;
  for (const evento of eventos) {
    acumulado -= evento.valor;
    if (acumulado < 0 && dataFicaNegativo === null) {
      dataFicaNegativo = evento.data;
    }
  }

  const saldoProjetado = saldoAtual - eventos.reduce((soma, evento) => soma + evento.valor, 0);

  return { saldoAtual, saldoProjetado, eventos, dataFicaNegativo };
}
