import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import {
  marcarTransacaoProcessada,
  transacaoJaProcessada,
} from '../../src/db/repositories/transacoesOpenFinanceProcessadas.js';

const CHAVE_TESTE = 'chave-teste-transacoes-open-finance-processadas';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-transacoes-open-finance-processadas-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('transacaoJaProcessada / marcarTransacaoProcessada', () => {
  it('transação nunca marcada não é considerada processada', () => {
    expect(transacaoJaProcessada(db, 'tx-1')).toBe(false);
  });

  it('depois de marcada, passa a ser considerada processada', () => {
    marcarTransacaoProcessada(db, 'tx-1', 'transacao_criada');

    expect(transacaoJaProcessada(db, 'tx-1')).toBe(true);
  });

  it('marcar a mesma transação duas vezes lança erro (pluggy_transaction_id único)', () => {
    marcarTransacaoProcessada(db, 'tx-1', 'transacao_criada');

    expect(() => marcarTransacaoProcessada(db, 'tx-1', 'saque_ignorado')).toThrow();
  });
});
