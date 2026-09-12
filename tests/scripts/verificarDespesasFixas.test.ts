import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { criarDespesaFixa } from '../../src/db/repositories/despesasFixas.js';
import { migrate } from '../../src/db/migrate.js';
import { criarTransacao } from '../../src/db/repositories/transacoes.js';
import { obterAlertaDespesasFixas } from '../../src/scripts/verificarDespesasFixas.js';

const CHAVE_TESTE = 'chave-teste-verificar-despesas-fixas';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-verificar-despesas-fixas-test-'));
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

describe('obterAlertaDespesasFixas', () => {
  it('retorna undefined quando não há despesa fixa ativa', () => {
    expect(obterAlertaDespesasFixas(db, new Date(2026, 8, 20, 12, 0))).toBeUndefined();
  });

  it('retorna undefined quando toda despesa ativa tem transação correspondente no mês', () => {
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
      data: '2026-09-05',
    });

    expect(obterAlertaDespesasFixas(db, new Date(2026, 8, 20, 12, 0))).toBeUndefined();
  });

  it('retorna o texto do alerta quando alguma despesa ativa não tem transação correspondente no mês', () => {
    criarDespesaFixa(db, {
      contaId,
      descricao: 'Aluguel',
      categoria: 'Moradia',
      valorEsperado: 1500,
      diaVencimentoEsperado: 5,
      criadoEm: '2026-09-02',
    });

    const alerta = obterAlertaDespesasFixas(db, new Date(2026, 8, 20, 12, 0));
    expect(alerta).toContain('Aluguel');
    expect(alerta).toContain('2026-09-01');
  });
});
