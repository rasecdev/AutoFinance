import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolverCartaoId, resolverContaId, resolverDividaId } from '../../../src/ai/tools/resolucao.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarCartao } from '../../../src/db/repositories/cartoes.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { criarDivida } from '../../../src/db/repositories/dividas.js';
import { migrate } from '../../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-resolucao';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-resolucao-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('resolverContaId — busca aproximada (erro de digitação)', () => {
  it('resolve mesmo com um erro de digitação no apelido', () => {
    const contaId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Principal' }).id;

    const resultado = resolverContaId(db, undefined, 'Principa');

    expect(resultado).toEqual({ ok: true, id: contaId });
  });

  it('não resolve quando o nome informado não se parece com nenhuma conta existente', () => {
    criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Principal' });

    const resultado = resolverContaId(db, undefined, 'Xablau');

    expect(resultado.ok).toBe(false);
  });
});

describe('resolverCartaoId — busca aproximada (erro de digitação)', () => {
  it('resolve mesmo com um erro de digitação no nome do cartão', () => {
    const contaId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Principal' }).id;
    const cartaoId = criarCartao(db, { contaId, nome: 'Nubank Cartão', limite: 5000, diaFechamento: 5, diaVencimento: 10 }).id;

    const resultado = resolverCartaoId(db, undefined, 'Nubank Cartao');

    expect(resultado).toEqual({ ok: true, id: cartaoId });
  });
});

describe('resolverContaId/resolverCartaoId — nome parcial (achado real: "nubank" para "Nubank Cartão")', () => {
  it('resolve conta por nome parcial (substring, não é erro de digitação)', () => {
    const contaId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Nubank PJ' }).id;

    const resultado = resolverContaId(db, undefined, 'nubank');

    expect(resultado).toEqual({ ok: true, id: contaId });
  });

  it('resolve cartão por nome parcial (substring, não é erro de digitação)', () => {
    const contaId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Principal' }).id;
    const cartaoId = criarCartao(db, { contaId, nome: 'Nubank Cartão', limite: 5000, diaFechamento: 5, diaVencimento: 10 }).id;

    const resultado = resolverCartaoId(db, undefined, 'nubank');

    expect(resultado).toEqual({ ok: true, id: cartaoId });
  });

  it('pede pra desambiguar quando o nome parcial casa com mais de um cartão', () => {
    const contaId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Principal' }).id;
    const outraContaId = criarConta(db, { bancoNome: 'Bradesco', tipo: 'PF', apelido: 'Outra' }).id;
    criarCartao(db, { contaId, nome: 'Nubank PF', limite: 5000, diaFechamento: 5, diaVencimento: 10 });
    criarCartao(db, { contaId: outraContaId, nome: 'Nubank PJ', limite: 5000, diaFechamento: 5, diaVencimento: 10 });

    const resultado = resolverCartaoId(db, undefined, 'nubank');

    expect(resultado.ok).toBe(false);
  });
});

describe('resolverDividaId — busca aproximada na divida_descricao', () => {
  it('resolve mesmo com um erro de digitação na descrição', () => {
    const contaId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Principal' }).id;
    criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 1000,
      numParcelas: 4,
      dataInicio: '2026-09-01',
      descricao: 'Financiamento carro',
    });
    criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 2000,
      numParcelas: 6,
      dataInicio: '2026-09-01',
      descricao: 'Reforma casa',
    });

    const resultado = resolverDividaId(db, contaId, 'emprestimo', 'Financiamento caro');

    expect(resultado.ok).toBe(true);
  });

  it('resolve por nome parcial (não é erro de digitação, é descrição incompleta)', () => {
    const contaId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Principal' }).id;
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 12000,
      numParcelas: 12,
      dataInicio: '2026-09-01',
      descricao: 'Financiamento Moto',
    });
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 8000,
      numParcelas: 10,
      dataInicio: '2026-09-01',
      descricao: 'Reforma casa',
    });

    const resultado = resolverDividaId(db, contaId, 'financiamento', 'Moto');

    expect(resultado.ok).toBe(true);
  });

  it('resolve também na direção inversa (texto informado maior que a descrição real)', () => {
    const contaId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Principal' }).id;
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 12000,
      numParcelas: 12,
      dataInicio: '2026-09-01',
      descricao: 'Moto',
    });

    const resultado = resolverDividaId(db, contaId, 'financiamento', 'Financiamento da Moto');

    expect(resultado.ok).toBe(true);
  });
});
