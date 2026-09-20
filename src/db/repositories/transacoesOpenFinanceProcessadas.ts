import type { DbClient } from '../client.js';

export type ResultadoProcessamento =
  | 'transacao_criada'
  | 'correspondencia_manual'
  | 'correspondencia_fatura_parcela'
  | 'saque_ignorado';

export function transacaoJaProcessada(db: DbClient, pluggyTransactionId: string): boolean {
  const linha = db
    .prepare('SELECT 1 FROM transacoes_open_finance_processadas WHERE pluggy_transaction_id = ?')
    .get(pluggyTransactionId);

  return linha !== undefined;
}

export function marcarTransacaoProcessada(
  db: DbClient,
  pluggyTransactionId: string,
  resultado: ResultadoProcessamento,
): void {
  db.prepare(
    `INSERT INTO transacoes_open_finance_processadas (pluggy_transaction_id, processado_em, resultado)
     VALUES (?, datetime('now'), ?)`,
  ).run(pluggyTransactionId, resultado);
}
