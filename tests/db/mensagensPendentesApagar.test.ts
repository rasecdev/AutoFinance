import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import {
  agendarApagarPersistido,
  listarVencidas,
  removerAgendamento,
} from '../../src/db/repositories/mensagensPendentesApagar.js';

const CHAVE_TESTE = 'chave-teste-mensagens-pendentes-apagar';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-mensagens-pendentes-apagar-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('mensagensPendentesApagar', () => {
  it('agendamento no futuro não aparece como vencido', () => {
    agendarApagarPersistido(db, 1, 100, 5 * 60 * 1000);

    expect(listarVencidas(db)).toEqual([]);
  });

  it('agendamento no passado (tempo já decorrido) aparece como vencido', () => {
    agendarApagarPersistido(db, 1, 100, -1000);

    expect(listarVencidas(db)).toEqual([{ chatId: 1, messageId: 100 }]);
  });

  it('removerAgendamento tira da lista de vencidas', () => {
    agendarApagarPersistido(db, 1, 100, -1000);
    removerAgendamento(db, 1, 100);

    expect(listarVencidas(db)).toEqual([]);
  });

  it('remover um agendamento não afeta outro chat/mensagem', () => {
    agendarApagarPersistido(db, 1, 100, -1000);
    agendarApagarPersistido(db, 2, 200, -1000);
    removerAgendamento(db, 1, 100);

    expect(listarVencidas(db)).toEqual([{ chatId: 2, messageId: 200 }]);
  });
});
