import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { buscarCartaoPorNome, buscarCartaoPorNomeParcial, cartaoExiste, criarCartao } from '../../src/db/repositories/cartoes.js';
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

describe('cartaoExiste', () => {
  it('retorna true para cartão existente e false para inexistente', () => {
    const conta = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' });
    const cartao = criarCartao(db, {
      contaId: conta.id,
      nome: 'Roxinho',
      limite: 1000,
      diaFechamento: 5,
      diaVencimento: 12,
    });

    expect(cartaoExiste(db, cartao.id)).toBe(true);
    expect(cartaoExiste(db, cartao.id + 999)).toBe(false);
  });
});

describe('buscarCartaoPorNome', () => {
  it('encontra por nome exato, sem diferenciar maiúsculas/minúsculas', () => {
    const conta = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' });
    const cartao = criarCartao(db, {
      contaId: conta.id,
      nome: 'Roxinho',
      limite: 1000,
      diaFechamento: 5,
      diaVencimento: 12,
    });

    expect(buscarCartaoPorNome(db, 'roxinho')).toEqual([cartao]);
  });

  it('retorna array vazio quando não encontra', () => {
    expect(buscarCartaoPorNome(db, 'Inexistente')).toEqual([]);
  });

  it('retorna todos os cartões quando o nome é ambíguo entre contas diferentes', () => {
    const conta1 = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' });
    const conta2 = criarConta(db, { bancoNome: 'Itaú', tipo: 'PJ', apelido: 'Empresa' });
    // idx_cartoes_conta_nome_unico só impede nome repetido na MESMA conta — nomes iguais em
    // contas diferentes continuam ambíguos pra busca global (buscarCartaoPorNome).
    criarCartao(db, { contaId: conta1.id, nome: 'Cartão', limite: 1000, diaFechamento: 5, diaVencimento: 12 });
    criarCartao(db, { contaId: conta2.id, nome: 'Cartão', limite: 2000, diaFechamento: 10, diaVencimento: 17 });

    expect(buscarCartaoPorNome(db, 'Cartão')).toHaveLength(2);
  });
});

describe('buscarCartaoPorNomeParcial', () => {
  it('encontra por substring, case-insensitive (achado real: "nubank" para "Nubank Cartão")', () => {
    const conta = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' });
    const cartao = criarCartao(db, {
      contaId: conta.id,
      nome: 'Nubank Cartão',
      limite: 5000,
      diaFechamento: 5,
      diaVencimento: 10,
    });

    expect(buscarCartaoPorNomeParcial(db, 'nubank')).toEqual([cartao]);
  });

  it('retorna array vazio quando nenhum nome contém o texto', () => {
    expect(buscarCartaoPorNomeParcial(db, 'xablau')).toEqual([]);
  });

  it('encontra quando o texto informado contém o nome real mais uma palavra genérica (achado real de teste manual)', () => {
    const conta = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' });
    const cartao = criarCartao(db, { contaId: conta.id, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 });

    expect(buscarCartaoPorNomeParcial(db, 'Cartão Nubank')).toEqual([cartao]);
  });
});
