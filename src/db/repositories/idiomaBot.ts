import type { DbClient } from '../client.js';

export type Idioma = 'pt' | 'en' | 'es';

// Singleton (id sempre 1, ver migration 0021) -- idioma ativo único, global
// por instância. Sem linha ainda = 'pt' (comportamento de hoje, preservado
// sem precisar de seed).
export function obterIdioma(db: DbClient): Idioma {
  const linha = db.prepare('SELECT idioma FROM idioma_bot WHERE id = 1').get() as
    | { idioma: Idioma }
    | undefined;
  return linha?.idioma ?? 'pt';
}

export function definirIdioma(db: DbClient, idioma: Idioma): void {
  db.prepare(
    `INSERT INTO idioma_bot (id, idioma)
     VALUES (1, @idioma)
     ON CONFLICT(id) DO UPDATE SET idioma = excluded.idioma`,
  ).run({ idioma });
}
