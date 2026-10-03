import type { DbClient } from '../client.js';

// Singleton (id sempre 1, ver migration 0018) — nunca mais de uma linha, mesmo
// trocando de conta Google. NUNCA exponha isto via consultar_dados_dinamico/
// consultar_e_graficar (src/ai/tools/consultaDinamica.ts) — ver comentário da
// migration.
export function salvarRefreshToken(db: DbClient, refreshToken: string): void {
  db.prepare(
    `INSERT INTO credenciais_google (id, refresh_token, atualizado_em)
     VALUES (1, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET refresh_token = excluded.refresh_token, atualizado_em = excluded.atualizado_em`,
  ).run(refreshToken);
}

export function obterRefreshToken(db: DbClient): string | null {
  const linha = db.prepare('SELECT refresh_token FROM credenciais_google WHERE id = 1').get() as
    | { refresh_token: string }
    | undefined;
  return linha?.refresh_token ?? null;
}
