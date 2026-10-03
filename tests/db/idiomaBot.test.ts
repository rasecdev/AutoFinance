import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { definirIdioma, obterIdioma } from '../../src/db/repositories/idiomaBot.js';

const CHAVE_TESTE = 'chave-teste-idioma-bot';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-idioma-bot-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('obterIdioma / definirIdioma', () => {
  it("devolve 'pt' em banco novo, sem nenhuma linha gravada", () => {
    expect(obterIdioma(db)).toBe('pt');
  });

  it('definirIdioma grava e obterIdioma reflete o valor novo', () => {
    definirIdioma(db, 'en');

    expect(obterIdioma(db)).toBe('en');
  });

  it('definirIdioma chamado duas vezes não cria linha duplicada (upsert)', () => {
    definirIdioma(db, 'en');
    definirIdioma(db, 'es');

    expect(obterIdioma(db)).toBe('es');
    const linhas = db.prepare('SELECT * FROM idioma_bot').all();
    expect(linhas).toHaveLength(1);
  });
});
