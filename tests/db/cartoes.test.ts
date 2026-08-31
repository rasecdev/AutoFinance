import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { criarCartao } from '../../src/db/repositories/cartoes.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { migrate } from '../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-cartoes';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-cartoes-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('criarCartao', () => {
  it('cria um cartão vinculado a uma conta existente', () => {
    const conta = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Conta principal' });

    const cartao = criarCartao(db, {
      contaId: conta.id,
      nome: 'Nubank Roxinho',
      limite: 5000,
      diaFechamento: 10,
      diaVencimento: 17,
    });

    expect(cartao).toMatchObject({
      contaId: conta.id,
      nome: 'Nubank Roxinho',
      limite: 5000,
      diaFechamento: 10,
      diaVencimento: 17,
    });

    const linha = db.prepare('SELECT * FROM cartoes WHERE id = ?').get(cartao.id) as Record<
      string,
      unknown
    >;
    expect(linha).toMatchObject({ conta_id: conta.id, nome: 'Nubank Roxinho', limite: 5000 });
  });
});
