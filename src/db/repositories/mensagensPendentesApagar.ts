import type { DbClient } from '../client.js';

export type MensagemPendenteApagar = {
  chatId: number;
  messageId: number;
};

// Complementa o setTimeout em memoria de registrarEmail.ts (que continua
// sendo a via normal de apagar, sem round-trip de banco) -- serve só pra
// sobreviver a um restart do bot antes do timer disparar (ver migration
// 0013). agendarEm recebe a data/hora alvo já calculada, sempre em UTC via
// datetime('now', '+N seconds') pra não depender do relogio local do Node.
export function agendarApagarPersistido(
  db: DbClient,
  chatId: number,
  messageId: number,
  tempoMs: number,
): void {
  const segundos = Math.round(tempoMs / 1000);
  const modificador = `${segundos >= 0 ? '+' : ''}${segundos} seconds`;

  db.prepare(
    `INSERT INTO mensagens_pendentes_apagar (chat_id, message_id, apagar_em, criado_em)
     VALUES (?, ?, datetime('now', ?), datetime('now'))
     ON CONFLICT(chat_id, message_id) DO UPDATE SET
       apagar_em = excluded.apagar_em,
       criado_em = excluded.criado_em`,
  ).run(chatId, messageId, modificador);
}

export function listarVencidas(db: DbClient): MensagemPendenteApagar[] {
  const linhas = db
    .prepare("SELECT chat_id, message_id FROM mensagens_pendentes_apagar WHERE apagar_em <= datetime('now')")
    .all() as { chat_id: number; message_id: number }[];

  return linhas.map((linha) => ({ chatId: linha.chat_id, messageId: linha.message_id }));
}

export function removerAgendamento(db: DbClient, chatId: number, messageId: number): void {
  db.prepare('DELETE FROM mensagens_pendentes_apagar WHERE chat_id = ? AND message_id = ?').run(chatId, messageId);
}
