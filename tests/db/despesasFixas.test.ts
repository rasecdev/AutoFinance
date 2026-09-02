import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { criarCartao } from '../../src/db/repositories/cartoes.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import {
  atualizarDespesaFixa,
  buscarDespesasFixasPorConta,
  criarDespesaFixa,
  obterDespesaFixa,
} from '../../src/db/repositories/despesasFixas.js';
import { migrate } from '../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-despesas-fixas';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-despesas-fixas-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Conta principal' }).id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('criarDespesaFixa', () => {
  it('grava com origem manual e status ativa', () => {
    const despesa = criarDespesaFixa(db, {
      contaId,
      descricao: 'Aluguel',
      categoria: 'Moradia',
      valorEsperado: 1500,
      diaVencimentoEsperado: 5,
      criadoEm: '2026-09-02',
    });

    expect(despesa.origem).toBe('manual');
    expect(despesa.status).toBe('ativa');
    expect(obterDespesaFixa(db, despesa.id)).toMatchObject({ descricao: 'Aluguel', valorEsperado: 1500 });
  });

  it('aceita cartao_id opcional', () => {
    const cartaoId = criarCartao(db, {
      contaId,
      nome: 'Nubank Cartão',
      limite: 1000,
      diaFechamento: 10,
      diaVencimento: 17,
    }).id;

    const despesa = criarDespesaFixa(db, {
      contaId,
      cartaoId,
      descricao: 'Netflix',
      categoria: 'Assinatura',
      valorEsperado: 39.9,
      diaVencimentoEsperado: 10,
      criadoEm: '2026-09-02',
    });

    expect(despesa.cartaoId).toBe(cartaoId);
  });
});

describe('buscarDespesasFixasPorConta', () => {
  it('lista despesas de qualquer status (inclusive pausada)', () => {
    const despesa = criarDespesaFixa(db, {
      contaId,
      descricao: 'Academia',
      categoria: 'Saúde',
      valorEsperado: 100,
      diaVencimentoEsperado: 15,
      criadoEm: '2026-09-02',
    });
    atualizarDespesaFixa(db, despesa.id, { status: 'pausada' });

    const encontradas = buscarDespesasFixasPorConta(db, contaId);
    expect(encontradas).toHaveLength(1);
    expect(encontradas[0]?.status).toBe('pausada');
  });
});

describe('atualizarDespesaFixa', () => {
  it('atualiza valor, dia e status independentemente', () => {
    const despesa = criarDespesaFixa(db, {
      contaId,
      descricao: 'Internet',
      categoria: 'Moradia',
      valorEsperado: 100,
      diaVencimentoEsperado: 10,
      criadoEm: '2026-09-02',
    });

    const atualizada = atualizarDespesaFixa(db, despesa.id, { valorEsperado: 120 });
    expect(atualizada?.valorEsperado).toBe(120);
    expect(atualizada?.diaVencimentoEsperado).toBe(10);

    const pausada = atualizarDespesaFixa(db, despesa.id, { status: 'pausada' });
    expect(pausada?.status).toBe('pausada');
    expect(pausada?.valorEsperado).toBe(120);
  });

  it('retorna undefined para id inexistente', () => {
    expect(atualizarDespesaFixa(db, 999, { valorEsperado: 10 })).toBeUndefined();
  });

  it('sem mudanças retorna o registro atual', () => {
    const despesa = criarDespesaFixa(db, {
      contaId,
      descricao: 'Água',
      categoria: 'Moradia',
      valorEsperado: 80,
      diaVencimentoEsperado: 20,
      criadoEm: '2026-09-02',
    });

    expect(atualizarDespesaFixa(db, despesa.id, {})).toMatchObject({ valorEsperado: 80 });
  });
});
