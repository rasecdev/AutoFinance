import type { DbClient } from '../db/client.js';
import { listarDespesasFixasAtivas, type DespesaFixa } from '../db/repositories/despesasFixas.js';
import { listarTransacoesAtivas } from '../db/repositories/transacoes.js';
import type { PeriodoRelatorio } from './financeiro.js';

// Despesa fixa vinculada a cartão (cartaoId preenchido) fica fora da checagem
// — assinatura cobrada na fatura já é coberta pelo controle agregado de
// fatura (PLANO.md, linha 108), não tem rastreio individual por transação.
// Match por conta+categoria (case-insensitive, mesmo critério já usado por
// listarTransacoesAtivas), não por descrição exata — texto livre varia mais
// que categoria (ver tasks/plan.md, Architecture Decisions).
export function detectarDespesasFixasFaltantes(db: DbClient, janela: PeriodoRelatorio): DespesaFixa[] {
  const ativas = listarDespesasFixasAtivas(db).filter((despesa) => despesa.cartaoId === null);

  return ativas.filter((despesa) => {
    const transacoesCorrespondentes = listarTransacoesAtivas(db, {
      contaId: despesa.contaId,
      categoria: despesa.categoria,
      dataInicio: janela.inicio,
      dataFim: janela.fim,
    });
    return transacoesCorrespondentes.length === 0;
  });
}

export function formatarAlertaDespesasFixas(faltantes: DespesaFixa[], janela: PeriodoRelatorio): string {
  const linhas = faltantes.map(
    (despesa) =>
      `- ${despesa.descricao} (esperado: R$ ${despesa.valorEsperado.toFixed(2)}, todo dia ${despesa.diaVencimentoEsperado})`,
  );

  return `⚠️ Despesas fixas que não apareceram em ${janela.inicio}–${janela.fim}:\n\n${linhas.join('\n')}`;
}
