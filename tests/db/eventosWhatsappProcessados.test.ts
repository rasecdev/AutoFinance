import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { eventoJaProcessado, marcarEventoProcessado } from '../../src/db/repositories/eventosWhatsappProcessados.js';

const CHAVE_TESTE = 'chave-teste-eventos-whatsapp-processados';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-eventos-whatsapp-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('eventoJaProcessado / marcarEventoProcessado', () => {
  it('retorna false pra evento nunca marcado', () => {
    expect(eventoJaProcessado(db, 'evento-1')).toBe(false);
  });

  it('marcarEventoProcessado grava a linha e eventoJaProcessado passa a retornar true', () => {
    marcarEventoProcessado(db, 'evento-1');

    expect(eventoJaProcessado(db, 'evento-1')).toBe(true);
  });

  it('marcar o mesmo evento duas vezes é idempotente (não duplica, não lança erro — reentrega de webhook)', () => {
    marcarEventoProcessado(db, 'evento-1');
    marcarEventoProcessado(db, 'evento-1');

    expect(eventoJaProcessado(db, 'evento-1')).toBe(true);
    const linhas = db.prepare('SELECT * FROM eventos_whatsapp_processados WHERE evento_id = ?').all('evento-1');
    expect(linhas).toHaveLength(1);
  });

  it('marcar um evento não afeta outro evento', () => {
    marcarEventoProcessado(db, 'evento-1');

    expect(eventoJaProcessado(db, 'evento-2')).toBe(false);
  });
});
