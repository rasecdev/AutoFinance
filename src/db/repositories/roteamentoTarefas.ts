import type { DbClient } from '../client.js';

export function obterModeloRoteamento(db: DbClient, fluxo: string): string | undefined {
  const linha = db
    .prepare('SELECT modelo_preferido FROM roteamento_tarefas WHERE fluxo = ?')
    .get(fluxo) as { modelo_preferido: string } | undefined;

  return linha?.modelo_preferido;
}

export function definirRoteamento(
  db: DbClient,
  fluxo: string,
  modeloPreferido: string,
  requisitos?: string,
): void {
  db.prepare(
    `INSERT INTO roteamento_tarefas (fluxo, modelo_preferido, requisitos, atualizado_em)
     VALUES (@fluxo, @modeloPreferido, @requisitos, @atualizadoEm)
     ON CONFLICT(fluxo) DO UPDATE SET
       modelo_preferido = excluded.modelo_preferido,
       requisitos = excluded.requisitos,
       atualizado_em = excluded.atualizado_em`,
  ).run({
    fluxo,
    modeloPreferido,
    requisitos: requisitos ?? null,
    atualizadoEm: new Date().toISOString(),
  });
}
