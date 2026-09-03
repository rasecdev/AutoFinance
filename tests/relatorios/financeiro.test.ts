import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { migrate } from '../../src/db/migrate.js';
import { criarTransacao, excluirTransacao } from '../../src/db/repositories/transacoes.js';
import { criarTransferencia } from '../../src/db/repositories/transferencias.js';
import { agregarFinanceiroPeriodo } from '../../src/relatorios/financeiro.js';

const CHAVE_TESTE = 'chave-teste-relatorios-financeiro';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-relatorios-financeiro-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal', saldoInicial: 100 }).id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('agregarFinanceiroPeriodo', () => {
  it('retorna zerado quando não há transação no período', () => {
    const resultado = agregarFinanceiroPeriodo(db, { inicio: '2026-03-01', fim: '2026-03-31' });

    expect(resultado.totalReceita).toBe(0);
    expect(resultado.totalDespesa).toBe(0);
    expect(resultado.porCategoria).toEqual([]);
    expect(resultado.saldoConsolidado).toBe(100);
  });

  it('soma receita e despesa do período, quebrado por categoria', () => {
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 30, categoria: 'transporte', data: '2026-03-05' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 20, categoria: 'transporte', data: '2026-03-10' });
    criarTransacao(db, { contaId, tipo: 'receita', valor: 1000, categoria: 'salario', data: '2026-03-01' });

    const resultado = agregarFinanceiroPeriodo(db, { inicio: '2026-03-01', fim: '2026-03-31' });

    expect(resultado.totalReceita).toBe(1000);
    expect(resultado.totalDespesa).toBe(50);
    expect(resultado.porCategoria).toEqual(
      expect.arrayContaining([
        { categoria: 'transporte', totalReceita: 0, totalDespesa: 50 },
        { categoria: 'salario', totalReceita: 1000, totalDespesa: 0 },
      ]),
    );
  });

  it('ignora transação fora do período', () => {
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 30, categoria: 'transporte', data: '2026-02-28' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 40, categoria: 'transporte', data: '2026-04-01' });

    const resultado = agregarFinanceiroPeriodo(db, { inicio: '2026-03-01', fim: '2026-03-31' });

    expect(resultado.totalDespesa).toBe(0);
  });

  it('ignora transação excluída', () => {
    const transacao = criarTransacao(db, {
      contaId,
      tipo: 'despesa',
      valor: 30,
      categoria: 'transporte',
      data: '2026-03-05',
    });
    excluirTransacao(db, transacao.id);

    const resultado = agregarFinanceiroPeriodo(db, { inicio: '2026-03-01', fim: '2026-03-31' });

    expect(resultado.totalDespesa).toBe(0);
  });

  it('não conta transferência como receita/despesa, mas reflete no saldo consolidado', () => {
    const contaDestinoId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Poupança' }).id;
    criarTransferencia(db, { contaOrigemId: contaId, contaDestinoId, valor: 50, data: '2026-03-05' });

    const resultado = agregarFinanceiroPeriodo(db, { inicio: '2026-03-01', fim: '2026-03-31' });

    expect(resultado.totalReceita).toBe(0);
    expect(resultado.totalDespesa).toBe(0);
    expect(resultado.saldoConsolidado).toBe(100);
  });

  it('soma o saldo consolidado de todas as contas', () => {
    criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Poupança', saldoInicial: 250 });

    const resultado = agregarFinanceiroPeriodo(db, { inicio: '2026-03-01', fim: '2026-03-31' });

    expect(resultado.saldoConsolidado).toBe(350);
  });
});
