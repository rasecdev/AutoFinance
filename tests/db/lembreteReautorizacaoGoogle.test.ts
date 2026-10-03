import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { obterUltimoEnvio, registrarEnvio } from '../../src/db/repositories/lembreteReautorizacaoGoogle.js';

const CHAVE_TESTE = 'chave-teste-lembrete-reautorizacao-google';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-lembrete-reautorizacao-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('registrarEnvio / obterUltimoEnvio', () => {
  it('retorna null com a tabela vazia', () => {
    expect(obterUltimoEnvio(db)).toBeNull();
  });

  it('registrarEnvio seguido de obterUltimoEnvio devolve uma data próxima de agora', () => {
    const antes = Date.now();
    registrarEnvio(db);
    const depois = Date.now();

    const ultimoEnvio = obterUltimoEnvio(db);
    expect(ultimoEnvio).not.toBeNull();
    expect(ultimoEnvio!.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect(ultimoEnvio!.getTime()).toBeLessThanOrEqual(depois + 1000);
  });

  it('registrarEnvio duas vezes não duplica linha', () => {
    registrarEnvio(db);
    registrarEnvio(db);

    const linhas = db.prepare('SELECT * FROM lembrete_reautorizacao_google').all();
    expect(linhas).toHaveLength(1);
  });
});
