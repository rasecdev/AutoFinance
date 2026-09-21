import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { estaPausado, pausar, retomar } from '../../src/db/repositories/botPausado.js';

const CHAVE_TESTE = 'chave-teste-bot-pausado';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-bot-pausado-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('pausar / retomar / estaPausado', () => {
  it('retorna false pra chat_id nunca pausado', () => {
    expect(estaPausado(db, 100)).toBe(false);
  });

  it('pausar grava a linha e estaPausado passa a retornar true', () => {
    pausar(db, 100);

    expect(estaPausado(db, 100)).toBe(true);
  });

  it('pausar duas vezes seguidas é idempotente (não duplica, não lança erro)', () => {
    pausar(db, 100);
    pausar(db, 100);

    expect(estaPausado(db, 100)).toBe(true);
    const linhas = db.prepare('SELECT * FROM bot_pausado WHERE chat_id = ?').all(100);
    expect(linhas).toHaveLength(1);
  });

  it('retomar remove a pausa', () => {
    pausar(db, 100);

    retomar(db, 100);

    expect(estaPausado(db, 100)).toBe(false);
  });

  it('retomar sem pausa ativa não lança erro', () => {
    expect(() => retomar(db, 100)).not.toThrow();
  });

  it('pausa de um chat não afeta outro chat', () => {
    pausar(db, 100);

    expect(estaPausado(db, 200)).toBe(false);
  });
});
