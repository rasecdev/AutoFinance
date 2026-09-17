import type { DbClient } from '../client.js';

export type PendenciaPersistida = {
  toolName: string;
  argumentos: unknown;
};

// Canal de confirmação entre processos (ver migration 0012) — usado por
// lerEmailFaturas.ts (roda em processo separado do bot) pra deixar uma
// pendência que o bot principal consiga ler quando o usuário responder.
// Uma pendência por chat: gravar de novo substitui a anterior (mesma
// semântica do Map em memória de confirmacao.ts).
export function definirPendenciaPersistida(db: DbClient, chatId: number, pendencia: PendenciaPersistida): void {
  db.prepare(
    `INSERT INTO confirmacoes_pendentes (chat_id, tool_name, argumentos, criado_em)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(chat_id) DO UPDATE SET
       tool_name = excluded.tool_name,
       argumentos = excluded.argumentos,
       criado_em = excluded.criado_em`,
  ).run(chatId, pendencia.toolName, JSON.stringify(pendencia.argumentos));
}

export function obterPendenciaPersistida(db: DbClient, chatId: number): PendenciaPersistida | undefined {
  const linha = db
    .prepare('SELECT tool_name, argumentos FROM confirmacoes_pendentes WHERE chat_id = ?')
    .get(chatId) as { tool_name: string; argumentos: string } | undefined;

  return linha ? { toolName: linha.tool_name, argumentos: JSON.parse(linha.argumentos) } : undefined;
}

export function removerPendenciaPersistida(db: DbClient, chatId: number): void {
  db.prepare('DELETE FROM confirmacoes_pendentes WHERE chat_id = ?').run(chatId);
}
