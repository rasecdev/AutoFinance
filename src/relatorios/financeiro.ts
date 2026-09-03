import type { DbClient } from '../db/client.js';
import { listarContas } from '../db/repositories/contas.js';
import { calcularSaldoTransacoesConta, listarTransacoesAtivas } from '../db/repositories/transacoes.js';
import { calcularSaldoTransferenciasConta } from '../db/repositories/transferencias.js';

export type PeriodoRelatorio = {
  inicio: string;
  fim: string;
};

export type TotalPorCategoria = {
  categoria: string;
  totalReceita: number;
  totalDespesa: number;
};

export type AgregacaoFinanceira = {
  totalReceita: number;
  totalDespesa: number;
  porCategoria: TotalPorCategoria[];
  saldoConsolidado: number;
};

export function agregarFinanceiroPeriodo(db: DbClient, periodo: PeriodoRelatorio): AgregacaoFinanceira {
  const transacoes = listarTransacoesAtivas(db, { dataInicio: periodo.inicio, dataFim: periodo.fim });

  const porCategoriaMap = new Map<string, TotalPorCategoria>();
  let totalReceita = 0;
  let totalDespesa = 0;

  for (const transacao of transacoes) {
    const atual = porCategoriaMap.get(transacao.categoria) ?? {
      categoria: transacao.categoria,
      totalReceita: 0,
      totalDespesa: 0,
    };

    if (transacao.tipo === 'receita') {
      atual.totalReceita += transacao.valor;
      totalReceita += transacao.valor;
    } else {
      atual.totalDespesa += transacao.valor;
      totalDespesa += transacao.valor;
    }

    porCategoriaMap.set(transacao.categoria, atual);
  }

  // Saldo consolidado é sempre o saldo ATUAL (não do período) — mesma regra
  // de consultar_saldo (Fase 3): base da conta + delta de transações/transferências
  // até agora, somado entre todas as contas.
  const saldoConsolidado = listarContas(db).reduce(
    (soma, conta) =>
      soma +
      conta.saldoAtual +
      calcularSaldoTransacoesConta(db, conta.id) +
      calcularSaldoTransferenciasConta(db, conta.id),
    0,
  );

  return {
    totalReceita,
    totalDespesa,
    porCategoria: [...porCategoriaMap.values()],
    saldoConsolidado,
  };
}
