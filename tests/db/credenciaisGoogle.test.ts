import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { obterRefreshToken, salvarRefreshToken } from '../../src/db/repositories/credenciaisGoogle.js';

const CHAVE_TESTE = 'chave-teste-credenciais-google';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-credenciais-google-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('salvarRefreshToken / obterRefreshToken', () => {
  it('retorna null com a tabela vazia', () => {
    expect(obterRefreshToken(db)).toBeNull();
  });

  it('salvarRefreshToken seguido de obterRefreshToken devolve o valor salvo', () => {
    salvarRefreshToken(db, 'token-inicial');

    expect(obterRefreshToken(db)).toBe('token-inicial');
  });

  it('salvar duas vezes com valores diferentes não duplica linha e devolve o valor mais recente', () => {
    salvarRefreshToken(db, 'token-inicial');
    salvarRefreshToken(db, 'token-novo');

    expect(obterRefreshToken(db)).toBe('token-novo');
    const linhas = db.prepare('SELECT * FROM credenciais_google').all();
    expect(linhas).toHaveLength(1);
  });
});
