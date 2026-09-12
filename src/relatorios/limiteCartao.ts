import type { DbClient } from '../db/client.js';
import { listarTransacoesAtivas } from '../db/repositories/transacoes.js';

function paraISODate(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

// Início do ciclo atual de fatura a partir de dia_fechamento do cartão: se
// hoje já passou do fechamento deste mês, o ciclo atual começou no dia
// seguinte ao fechamento deste mês; senão, começou no mês anterior — mesmo
// princípio de "próxima ocorrência" já usado em fluxoCaixa.ts, mas pra trás.
function inicioCicloAtual(diaFechamento: number, hoje: Date): string {
  if (hoje.getDate() > diaFechamento) {
    return paraISODate(new Date(hoje.getFullYear(), hoje.getMonth(), diaFechamento + 1));
  }
  return paraISODate(new Date(hoje.getFullYear(), hoje.getMonth() - 1, diaFechamento + 1));
}

// Achado real (ver tasks/plan.md, Architecture Decisions): nada no projeto
// mantém faturas.valor a partir de transação registrada — calcula direto de
// transacoes, robusto independente desse gap.
export function calcularGastoCicloAtualCartao(db: DbClient, cartaoId: number, diaFechamento: number, hoje: Date): number {
  const dataInicio = inicioCicloAtual(diaFechamento, hoje);

  return listarTransacoesAtivas(db, { cartaoId, dataInicio })
    .filter((transacao) => transacao.tipo === 'despesa')
    .reduce((soma, transacao) => soma + transacao.valor, 0);
}
