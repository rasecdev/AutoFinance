import type { DbClient } from '../client.js';

export type ResultadoEmailProcessado =
  | 'fatura_registrada'
  | 'parcela_registrada'
  | 'pendente_confirmacao'
  | 'sem_correspondencia'
  | 'ignorado_nao_e_fatura';

export function emailJaProcessado(db: DbClient, gmailMessageId: string): boolean {
  const linha = db.prepare('SELECT 1 FROM emails_processados WHERE gmail_message_id = ?').get(gmailMessageId);
  return linha !== undefined;
}

export function marcarEmailProcessado(
  db: DbClient,
  gmailMessageId: string,
  resultado: ResultadoEmailProcessado,
): void {
  db.prepare(
    "INSERT INTO emails_processados (gmail_message_id, processado_em, resultado) VALUES (?, datetime('now'), ?)",
  ).run(gmailMessageId, resultado);
}
