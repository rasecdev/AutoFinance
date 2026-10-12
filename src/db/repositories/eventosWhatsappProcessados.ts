import type { DbClient } from '../client.js';

// Idempotência contra reentrega de evento da WAHA (webhook, Tarefa 132) —
// mesmo padrão de emailsProcessados.ts (Fase 7). marcarEventoProcessado é
// idempotente de propósito: chamar duas vezes pro mesmo id nunca lança erro
// (OR IGNORE em vez de INSERT puro, que violaria a UNIQUE na reentrega).
export function eventoJaProcessado(db: DbClient, eventoId: string): boolean {
  const linha = db.prepare('SELECT 1 FROM eventos_whatsapp_processados WHERE evento_id = ?').get(eventoId);
  return linha !== undefined;
}

export function marcarEventoProcessado(db: DbClient, eventoId: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO eventos_whatsapp_processados (evento_id, processado_em) VALUES (?, datetime('now'))",
  ).run(eventoId);
}
