import type { DbClient } from '../db/client.js';
import { listarContas, type TipoConta } from '../db/repositories/contas.js';
import { listarParcelasPendentesDividasAtivas } from '../db/repositories/dividas.js';
import { listarFaturasAbertas } from '../db/repositories/faturas.js';

export type PatrimonioPorTipo = {
  tipo: TipoConta;
  saldoContas: number;
  saldoDevedorDividas: number;
  valorFaturasAbertas: number;
  patrimonioLiquido: number;
};

export type PatrimonioLiquido = {
  porTipo: PatrimonioPorTipo[];
  consolidado: number;
};

export function calcularPatrimonioLiquido(db: DbClient): PatrimonioLiquido {
  const contas = listarContas(db);
  const tipoPorContaId = new Map(contas.map((conta) => [conta.id, conta.tipo]));

  const acumulado = new Map<TipoConta, { saldoContas: number; saldoDevedorDividas: number; valorFaturasAbertas: number }>(
    [
      ['PF', { saldoContas: 0, saldoDevedorDividas: 0, valorFaturasAbertas: 0 }],
      ['PJ', { saldoContas: 0, saldoDevedorDividas: 0, valorFaturasAbertas: 0 }],
    ],
  );

  for (const conta of contas) {
    acumulado.get(conta.tipo)!.saldoContas += conta.saldoAtual;
  }

  for (const item of listarParcelasPendentesDividasAtivas(db)) {
    const tipo = tipoPorContaId.get(item.contaId);
    if (tipo) acumulado.get(tipo)!.saldoDevedorDividas += item.parcela.valor;
  }

  for (const fatura of listarFaturasAbertas(db)) {
    const tipo = tipoPorContaId.get(fatura.contaId);
    if (tipo) acumulado.get(tipo)!.valorFaturasAbertas += fatura.valor;
  }

  const porTipo: PatrimonioPorTipo[] = (['PF', 'PJ'] as const).map((tipo) => {
    const valores = acumulado.get(tipo)!;
    return {
      tipo,
      ...valores,
      patrimonioLiquido: valores.saldoContas - valores.saldoDevedorDividas - valores.valorFaturasAbertas,
    };
  });

  const consolidado = porTipo.reduce((soma, item) => soma + item.patrimonioLiquido, 0);

  return { porTipo, consolidado };
}
