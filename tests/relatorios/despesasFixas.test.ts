import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { criarCartao } from '../../src/db/repositories/cartoes.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { criarDespesaFixa } from '../../src/db/repositories/despesasFixas.js';
import { migrate } from '../../src/db/migrate.js';
import { criarTransacao } from '../../src/db/repositories/transacoes.js';
import { detectarDespesasFixasFaltantes, formatarAlertaDespesasFixas } from '../../src/relatorios/despesasFixas.js';

const CHAVE_TESTE = 'chave-teste-relatorios-despesas-fixas';
const JANELA = { inicio: '2026-09-01', fim: '2026-09-30' };

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-relatorios-despesas-fixas-test-'));
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

describe('detectarDespesasFixasFaltantes', () => {
  it('lista despesa sem transação correspondente na janela', () => {
    const despesa = criarDespesaFixa(db, {
      contaId,
      descricao: 'Aluguel',
      categoria: 'Moradia',
      valorEsperado: 1500,
      diaVencimentoEsperado: 5,
      criadoEm: '2026-09-02',
    });

    const faltantes = detectarDespesasFixasFaltantes(db, JANELA);
    expect(faltantes.map((d) => d.id)).toEqual([despesa.id]);
  });

  it('não lista despesa com transação da mesma conta+categoria na janela', () => {
    criarDespesaFixa(db, {
      contaId,
      descricao: 'Aluguel',
      categoria: 'Moradia',
      valorEsperado: 1500,
      diaVencimentoEsperado: 5,
      criadoEm: '2026-09-02',
    });
    criarTransacao(db, {
      contaId,
      tipo: 'despesa',
      valor: 1500,
      categoria: 'Moradia',
      descricao: 'aluguel de setembro',
      data: '2026-09-05',
    });

    expect(detectarDespesasFixasFaltantes(db, JANELA)).toEqual([]);
  });

  it('categoria é case-insensitive no match', () => {
    criarDespesaFixa(db, {
      contaId,
      descricao: 'Aluguel',
      categoria: 'Moradia',
      valorEsperado: 1500,
      diaVencimentoEsperado: 5,
      criadoEm: '2026-09-02',
    });
    criarTransacao(db, {
      contaId,
      tipo: 'despesa',
      valor: 1500,
      categoria: 'MORADIA',
      data: '2026-09-05',
    });

    expect(detectarDespesasFixasFaltantes(db, JANELA)).toEqual([]);
  });

  it('ignora despesa fixa vinculada a cartão, mesmo sem transação correspondente', () => {
    const cartaoId = criarCartao(db, {
      contaId,
      nome: 'Cartão',
      limite: 1000,
      diaFechamento: 10,
      diaVencimento: 17,
    }).id;
    criarDespesaFixa(db, {
      contaId,
      cartaoId,
      descricao: 'Netflix',
      categoria: 'Assinatura',
      valorEsperado: 39.9,
      diaVencimentoEsperado: 10,
      criadoEm: '2026-09-02',
    });

    expect(detectarDespesasFixasFaltantes(db, JANELA)).toEqual([]);
  });

  it('lista vazia quando não há despesa fixa ativa', () => {
    expect(detectarDespesasFixasFaltantes(db, JANELA)).toEqual([]);
  });
});

describe('formatarAlertaDespesasFixas', () => {
  it('formata uma despesa faltante', () => {
    const despesa = criarDespesaFixa(db, {
      contaId,
      descricao: 'Aluguel',
      categoria: 'Moradia',
      valorEsperado: 1500,
      diaVencimentoEsperado: 5,
      criadoEm: '2026-09-02',
    });

    const texto = formatarAlertaDespesasFixas([despesa], JANELA);
    expect(texto).toContain('2026-09-01–2026-09-30');
    expect(texto).toContain('Aluguel (esperado: R$ 1500.00, todo dia 5)');
  });

  it('formata múltiplas despesas faltantes, uma por linha', () => {
    const aluguel = criarDespesaFixa(db, {
      contaId,
      descricao: 'Aluguel',
      categoria: 'Moradia',
      valorEsperado: 1500,
      diaVencimentoEsperado: 5,
      criadoEm: '2026-09-02',
    });
    const academia = criarDespesaFixa(db, {
      contaId,
      descricao: 'Academia',
      categoria: 'Saúde',
      valorEsperado: 100,
      diaVencimentoEsperado: 15,
      criadoEm: '2026-09-02',
    });

    const texto = formatarAlertaDespesasFixas([aluguel, academia], JANELA);
    expect(texto).toContain('Aluguel');
    expect(texto).toContain('Academia');
  });
});
