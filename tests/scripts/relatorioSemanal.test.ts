import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarConta } from '../../src/db/repositories/contas.js';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { criarTransacao } from '../../src/db/repositories/transacoes.js';
import { calcularProximoDomingoAs23h, montarRelatorioSemanal } from '../../src/scripts/relatorioSemanal.js';

const CHAVE_TESTE = 'chave-teste-relatorio-semanal';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-relatorio-semanal-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('calcularProximoDomingoAs23h', () => {
  it('quarta-feira: calcula o domingo seguinte às 23h', () => {
    const resultado = calcularProximoDomingoAs23h(new Date(2026, 2, 18, 10, 0)); // quarta

    expect(resultado).toEqual(new Date(2026, 2, 22, 23, 0, 0, 0));
  });

  it('domingo antes das 23h: dispara hoje às 23h', () => {
    const resultado = calcularProximoDomingoAs23h(new Date(2026, 2, 22, 20, 0)); // domingo

    expect(resultado).toEqual(new Date(2026, 2, 22, 23, 0, 0, 0));
  });

  it('domingo depois das 23h: dispara no domingo seguinte, não hoje de novo', () => {
    const resultado = calcularProximoDomingoAs23h(new Date(2026, 2, 22, 23, 30)); // domingo, 23h30

    expect(resultado).toEqual(new Date(2026, 2, 29, 23, 0, 0, 0));
  });

  it('domingo exatamente às 23h: já conta como passado, vai pro próximo', () => {
    const resultado = calcularProximoDomingoAs23h(new Date(2026, 2, 22, 23, 0, 0, 0));

    expect(resultado).toEqual(new Date(2026, 2, 29, 23, 0, 0, 0));
  });
});

describe('montarRelatorioSemanal', () => {
  it('inclui o relatório da semana atual e a comparação com a semana anterior', () => {
    const conta = criarConta(db, { bancoNome: 'Banco Teste', tipo: 'PF', apelido: 'Carteira', saldoInicial: 0 });

    // Semana atual: segunda 2026-03-16 a domingo 2026-03-22 (referência: quarta 18/03)
    criarTransacao(db, {
      contaId: conta.id,
      tipo: 'receita',
      categoria: 'salario',
      valor: 100,
      data: '2026-03-18',
      descricao: 'salário',
    });

    // Semana anterior: 2026-03-09 a 2026-03-15
    criarTransacao(db, {
      contaId: conta.id,
      tipo: 'receita',
      categoria: 'salario',
      valor: 40,
      data: '2026-03-10',
      descricao: 'salário anterior',
    });

    const texto = montarRelatorioSemanal(db, new Date(2026, 2, 18, 12, 0));

    expect(texto).toContain('2026-03-16 a 2026-03-22');
    expect(texto).toContain('Comparação com a semana anterior');
    expect(texto).toContain('Receita: +R$ 60.00');
  });
});
