import type { DbClient } from '../client.js';

// Kill switch simples por chat_id (ver migration 0017 e ASI10 no PLANO.md) --
// presenca de linha significa "pausado". pausar() e idempotente: pausar um
// chat ja pausado so atualiza pausado_em, sem erro nem linha duplicada.
// chatId: number (Telegram) | string (WhatsApp — Fase 9 Rodada 2); a coluna
// chat_id não precisa de migration pra aceitar os dois formatos, nenhuma
// tabela do projeto é STRICT (SQLite guarda qualquer tipo em qualquer
// coluna independente da afinidade declarada).
export function pausar(db: DbClient, chatId: number | string): void {
  db.prepare(
    `INSERT INTO bot_pausado (chat_id, pausado_em)
     VALUES (?, datetime('now'))
     ON CONFLICT(chat_id) DO UPDATE SET pausado_em = excluded.pausado_em`,
  ).run(chatId);
}

export function retomar(db: DbClient, chatId: number | string): void {
  db.prepare('DELETE FROM bot_pausado WHERE chat_id = ?').run(chatId);
}

export function estaPausado(db: DbClient, chatId: number | string): boolean {
  const linha = db.prepare('SELECT 1 FROM bot_pausado WHERE chat_id = ?').get(chatId);
  return linha !== undefined;
}
