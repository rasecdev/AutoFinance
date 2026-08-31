import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { contaExiste, criarConta } from '../../src/db/repositories/contas.js';

const CHAVE_TESTE = 'chave-teste-contas';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-contas-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function contarBancos() {
  return (db.prepare('SELECT COUNT(*) as total FROM bancos').get() as { total: number }).total;
}

describe('criarConta', () => {
  it('cria o banco automaticamente quando ele ainda não existe', () => {
    const conta = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Conta principal' });

    expect(conta).toMatchObject({ tipo: 'PF', apelido: 'Conta principal', saldoAtual: 0 });
    expect(contarBancos()).toBe(1);
  });

  it('reaproveita o banco existente em vez de duplicar', () => {
    criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Conta 1' });
    criarConta(db, { bancoNome: 'Nubank', tipo: 'PJ', apelido: 'Conta 2' });

    expect(contarBancos()).toBe(1);
  });

  it('usa saldoInicial quando informado', () => {
    const conta = criarConta(db, {
      bancoNome: 'Itaú',
      tipo: 'PJ',
      apelido: 'Conta PJ',
      saldoInicial: 2500,
    });

    expect(conta.saldoAtual).toBe(2500);
  });
});

describe('contaExiste', () => {
  it('retorna true para conta existente e false para inexistente', () => {
    const conta = criarConta(db, { bancoNome: 'Banco X', tipo: 'PF', apelido: 'Teste' });

    expect(contaExiste(db, conta.id)).toBe(true);
    expect(contaExiste(db, conta.id + 999)).toBe(false);
  });
});
