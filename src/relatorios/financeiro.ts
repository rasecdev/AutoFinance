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

export type TotalPorConta = {
  apelido: string;
  totalReceita: number;
  totalDespesa: number;
  saldoAtual: number;
};

export type AgregacaoFinanceira = {
  totalReceita: number;
  totalDespesa: number;
  porCategoria: TotalPorCategoria[];
  porConta: TotalPorConta[];
  saldoConsolidado: number;
};

export function agregarFinanceiroPeriodo(db: DbClient, periodo: PeriodoRelatorio): AgregacaoFinanceira {
  const transacoes = listarTransacoesAtivas(db, { dataInicio: periodo.inicio, dataFim: periodo.fim });

  const porCategoriaMap = new Map<string, TotalPorCategoria>();
  const totalPorContaIdMap = new Map<number, { totalReceita: number; totalDespesa: number }>();
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

    if (transacao.contaId !== null) {
      const atualConta = totalPorContaIdMap.get(transacao.contaId) ?? { totalReceita: 0, totalDespesa: 0 };
      if (transacao.tipo === 'receita') {
        atualConta.totalReceita += transacao.valor;
      } else {
        atualConta.totalDespesa += transacao.valor;
      }
      totalPorContaIdMap.set(transacao.contaId, atualConta);
    }
  }

  // Saldo consolidado (e o de cada conta em porConta) é sempre o saldo ATUAL
  // (não do período) — mesma regra de consultar_saldo (Fase 3): base da
  // conta + delta de transações/transferências até agora.
  let saldoConsolidado = 0;
  const porConta: TotalPorConta[] = [];
  for (const conta of listarContas(db)) {
    const saldoAtual =
      conta.saldoAtual + calcularSaldoTransacoesConta(db, conta.id) + calcularSaldoTransferenciasConta(db, conta.id);
    saldoConsolidado += saldoAtual;

    const totaisPeriodo = totalPorContaIdMap.get(conta.id) ?? { totalReceita: 0, totalDespesa: 0 };
    porConta.push({
      apelido: conta.apelido,
      totalReceita: totaisPeriodo.totalReceita,
      totalDespesa: totaisPeriodo.totalDespesa,
      saldoAtual,
    });
  }

  return {
    totalReceita,
    totalDespesa,
    porCategoria: [...porCategoriaMap.values()],
    porConta,
    saldoConsolidado,
  };
}
