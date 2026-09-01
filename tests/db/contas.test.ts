import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { buscarContaPorApelido, buscarContaPorApelidoParcial, contaExiste, criarConta } from '../../src/db/repositories/contas.js';

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

describe('buscarContaPorApelido', () => {
  it('encontra por apelido exato, sem diferenciar maiúsculas/minúsculas', () => {
    const conta = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' });

    expect(buscarContaPorApelido(db, 'principal')).toEqual([conta]);
    expect(buscarContaPorApelido(db, 'PRINCIPAL')).toEqual([conta]);
  });

  it('retorna array vazio quando não encontra', () => {
    expect(buscarContaPorApelido(db, 'Inexistente')).toEqual([]);
  });

  it('retorna todas as contas quando o apelido é ambíguo (case diferente, fora do índice único)', () => {
    // apelido tem índice único case-sensitive (idx_contas_apelido_unico) — "Principal" e
    // "principal" não colidem no banco, mas colidem na busca case-insensitive daqui, cenário
    // real pra dado legado/inserido fora do fluxo normal (criarConta já bloqueia isso).
    criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' });
    criarConta(db, { bancoNome: 'Itaú', tipo: 'PJ', apelido: 'principal' });

    expect(buscarContaPorApelido(db, 'Principal')).toHaveLength(2);
  });
});

describe('buscarContaPorApelidoParcial', () => {
  it('encontra por substring, case-insensitive', () => {
    const conta = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Nubank PJ' });

    expect(buscarContaPorApelidoParcial(db, 'nubank')).toEqual([conta]);
  });

  it('retorna array vazio quando nenhum apelido contém o texto', () => {
    criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' });

    expect(buscarContaPorApelidoParcial(db, 'xablau')).toEqual([]);
  });
});
