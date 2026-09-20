import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { registrarMapeamentoOpenFinance } from '../../src/db/repositories/contasOpenFinance.js';
import { criarConta } from '../../src/db/repositories/contas.js';

const CHAVE_TESTE = 'chave-teste-contas-open-finance';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-contas-open-finance-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' }).id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function lerMapeamentos() {
  return db.prepare('SELECT * FROM contas_open_finance').all() as Array<Record<string, unknown>>;
}

describe('registrarMapeamentoOpenFinance', () => {
  it('grava um mapeamento novo pra conta', () => {
    registrarMapeamentoOpenFinance(db, { pluggyItemId: 'item-1', pluggyAccountId: 'conta-pluggy-1', contaId });

    const linhas = lerMapeamentos();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ pluggy_item_id: 'item-1', pluggy_account_id: 'conta-pluggy-1', conta_id: contaId });
  });

  it('reconectar o mesmo pluggy_account_id atualiza em vez de duplicar', () => {
    registrarMapeamentoOpenFinance(db, { pluggyItemId: 'item-1', pluggyAccountId: 'conta-pluggy-1', contaId });
    registrarMapeamentoOpenFinance(db, { pluggyItemId: 'item-2', pluggyAccountId: 'conta-pluggy-1', contaId });

    const linhas = lerMapeamentos();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ pluggy_item_id: 'item-2' });
  });
});
