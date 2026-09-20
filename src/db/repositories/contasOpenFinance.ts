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
