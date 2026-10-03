import type { DbClient } from '../client.js';

// Singleton (id sempre 1, ver migration 0020) -- só "quando foi o último
// lembrete automático enviado", desacoplado de credenciais_google.atualizado_em
// de propósito (ver tasks/plan.md, Architecture Decisions).
export function registrarEnvio(db: DbClient): void {
  db.prepare(
    `INSERT INTO lembrete_reautorizacao_google (id, enviado_em)
     VALUES (1, @enviadoEm)
     ON CONFLICT(id) DO UPDATE SET enviado_em = excluded.enviado_em`,
  ).run({ enviadoEm: new Date().toISOString() });
}

export function obterUltimoEnvio(db: DbClient): Date | null {
  const linha = db.prepare('SELECT enviado_em FROM lembrete_reautorizacao_google WHERE id = 1').get() as
    | { enviado_em: string }
    | undefined;
  return linha ? new Date(linha.enviado_em) : null;
}
