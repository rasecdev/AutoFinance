import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DbClient } from './client.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export function migrate(db: DbClient): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      nome TEXT PRIMARY KEY,
      aplicada_em TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const jaAplicadas = new Set(
    db
      .prepare('SELECT nome FROM _migrations')
      .all()
      .map((row): string => (row as { nome: string }).nome),
  );

  const arquivos = readdirSync(migrationsDir)
    .filter((nome) => nome.endsWith('.sql'))
    .sort();

  for (const arquivo of arquivos) {
    if (jaAplicadas.has(arquivo)) {
      continue;
    }

    const sql = readFileSync(join(migrationsDir, arquivo), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (nome) VALUES (?)').run(arquivo);
  }
}
