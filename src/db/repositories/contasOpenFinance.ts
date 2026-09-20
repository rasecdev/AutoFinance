import type { DbClient } from '../client.js';

export type NovoMapeamentoOpenFinance = {
  pluggyItemId: string;
  pluggyAccountId: string;
  contaId?: number;
  cartaoId?: number;
};

// Upsert por pluggy_account_id — reconectar o mesmo item/conta (ex: depois
// de expirar) atualiza o mapeamento em vez de duplicar linha.
export function registrarMapeamentoOpenFinance(db: DbClient, mapeamento: NovoMapeamentoOpenFinance): void {
  db.prepare(
    `INSERT INTO contas_open_finance (pluggy_item_id, pluggy_account_id, conta_id, cartao_id, criado_em)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(pluggy_account_id) DO UPDATE SET
       pluggy_item_id = excluded.pluggy_item_id,
       conta_id = excluded.conta_id,
       cartao_id = excluded.cartao_id`,
  ).run(
    mapeamento.pluggyItemId,
    mapeamento.pluggyAccountId,
    mapeamento.contaId ?? null,
    mapeamento.cartaoId ?? null,
  );
}

export type MapeamentoOpenFinance = {
  pluggyItemId: string;
  pluggyAccountId: string;
  contaId: number | null;
  cartaoId: number | null;
};

// Usado pelo job de sincronização (sincronizarOpenFinance.ts, Tarefa 103)
// pra saber quais contas Pluggy já foram vinculadas e sincronizar cada uma.
export function listarContasOpenFinance(db: DbClient): MapeamentoOpenFinance[] {
  const linhas = db
    .prepare('SELECT pluggy_item_id, pluggy_account_id, conta_id, cartao_id FROM contas_open_finance')
    .all() as Array<{ pluggy_item_id: string; pluggy_account_id: string; conta_id: number | null; cartao_id: number | null }>;

  return linhas.map((linha) => ({
    pluggyItemId: linha.pluggy_item_id,
    pluggyAccountId: linha.pluggy_account_id,
    contaId: linha.conta_id,
    cartaoId: linha.cartao_id,
  }));
}
