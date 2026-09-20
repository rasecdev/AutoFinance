import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { criarCartao } from '../../src/db/repositories/cartoes.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { criarDivida } from '../../src/db/repositories/dividas.js';
import {
  encontrarPagamentoFaturaOuParcelaCorrespondente,
  encontrarTransacaoManualCorrespondente,
  pareceSaque,
} from '../../src/db/repositories/correspondenciaOpenFinance.js';
import { migrate } from '../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-correspondencia-open-finance';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-correspondencia-open-finance-test-'));
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

describe('encontrarTransacaoManualCorrespondente', () => {
  it('encontra transação manual com valor e data dentro da tolerância', () => {
    db.prepare(
      "INSERT INTO transacoes (conta_id, tipo, valor, categoria, data, origem) VALUES (?, 'despesa', 100, 'mercado', '2026-09-10', 'manual')",
    ).run(contaId);

    const resultado = encontrarTransacaoManualCorrespondente(db, { contaId, valor: 100.5, data: '2026-09-11' });

    expect(resultado).toBe('encontrada');
  });

  it('não encontra quando não há nenhuma transação manual próxima', () => {
    const resultado = encontrarTransacaoManualCorrespondente(db, { contaId, valor: 100, data: '2026-09-10' });

    expect(resultado).toBe('nao_encontrada');
  });

  it('não considera transação já vinda do Open Finance (origem diferente de manual)', () => {
    db.prepare(
      "INSERT INTO transacoes (conta_id, tipo, valor, categoria, data, origem) VALUES (?, 'despesa', 100, 'mercado', '2026-09-10', 'open_finance')",
    ).run(contaId);

    const resultado = encontrarTransacaoManualCorrespondente(db, { contaId, valor: 100, data: '2026-09-10' });

    expect(resultado).toBe('nao_encontrada');
  });

  it('fora da janela de data, não considera correspondência', () => {
    db.prepare(
      "INSERT INTO transacoes (conta_id, tipo, valor, categoria, data, origem) VALUES (?, 'despesa', 100, 'mercado', '2026-09-01', 'manual')",
    ).run(contaId);

    const resultado = encontrarTransacaoManualCorrespondente(db, { contaId, valor: 100, data: '2026-09-20' });

    expect(resultado).toBe('nao_encontrada');
  });

  it('mais de uma manual candidata dentro da tolerância — ambíguo, não resolve sozinho', () => {
    db.prepare(
      "INSERT INTO transacoes (conta_id, tipo, valor, categoria, data, origem) VALUES (?, 'despesa', 100, 'mercado', '2026-09-10', 'manual')",
    ).run(contaId);
    db.prepare(
      "INSERT INTO transacoes (conta_id, tipo, valor, categoria, data, origem) VALUES (?, 'despesa', 100, 'farmacia', '2026-09-11', 'manual')",
    ).run(contaId);

    const resultado = encontrarTransacaoManualCorrespondente(db, { contaId, valor: 100, data: '2026-09-10' });

    expect(resultado).toBe('ambigua');
  });

  it('também busca por cartao_id, quando a conta Pluggy mapeia pra um cartão (compra de crédito)', () => {
    const cartaoId = criarCartao(db, { contaId, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 }).id;
    db.prepare(
      "INSERT INTO transacoes (cartao_id, tipo, valor, categoria, data, origem) VALUES (?, 'despesa', 80, 'mercado', '2026-09-10', 'manual')",
    ).run(cartaoId);

    const resultado = encontrarTransacaoManualCorrespondente(db, { cartaoId, valor: 80, data: '2026-09-10' });

    expect(resultado).toBe('encontrada');
  });
});

describe('encontrarPagamentoFaturaOuParcelaCorrespondente', () => {
  it('encontra pagamento de fatura já paga, mesmo conta (via cartão)', () => {
    const cartaoId = criarCartao(db, { contaId, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 }).id;
    db.prepare(
      "INSERT INTO faturas (cartao_id, mes_referencia, valor, status, data_pagamento) VALUES (?, '2026-09', 500, 'paga', '2026-09-10')",
    ).run(cartaoId);

    const resultado = encontrarPagamentoFaturaOuParcelaCorrespondente(db, { contaId, valor: 500, data: '2026-09-10' });

    expect(resultado).toBe('encontrada');
  });

  it('encontra pagamento de parcela já paga, mesma conta (via dívida)', () => {
    const { divida } = criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 1200,
      numParcelas: 12,
      dataInicio: '2026-01-01',
    });
    db.prepare(
      "UPDATE parcelas SET status = 'paga', data_pagamento = '2026-09-05' WHERE divida_id = ? AND numero_parcela = 1",
    ).run(divida.id);

    const parcela = db.prepare('SELECT valor FROM parcelas WHERE divida_id = ? AND numero_parcela = 1').get(
      divida.id,
    ) as { valor: number };

    const resultado = encontrarPagamentoFaturaOuParcelaCorrespondente(db, {
      contaId,
      valor: parcela.valor,
      data: '2026-09-05',
    });

    expect(resultado).toBe('encontrada');
  });

  it('fatura aberta (não paga) não conta como correspondência', () => {
    const cartaoId = criarCartao(db, { contaId, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 }).id;
    db.prepare("INSERT INTO faturas (cartao_id, mes_referencia, valor, status) VALUES (?, '2026-09', 500, 'aberta')").run(
      cartaoId,
    );

    const resultado = encontrarPagamentoFaturaOuParcelaCorrespondente(db, { contaId, valor: 500, data: '2026-09-10' });

    expect(resultado).toBe('nao_encontrada');
  });
});

describe('pareceSaque', () => {
  it('operationType SAQUE (Open Finance) é reconhecido diretamente', () => {
    expect(
      pareceSaque({ id: 'tx-1', accountId: 'c1', description: 'Retirada', amount: -100, date: '2026-09-10', operationType: 'SAQUE' }),
    ).toBe(true);
  });

  it('descrição com "saque" é reconhecida sem operationType (fallback)', () => {
    expect(
      pareceSaque({ id: 'tx-1', accountId: 'c1', description: 'Saque em caixa eletrônico', amount: -100, date: '2026-09-10' }),
    ).toBe(true);
  });

  it('compra comum não é reconhecida como saque', () => {
    expect(
      pareceSaque({ id: 'tx-1', accountId: 'c1', description: 'Supermercado XYZ', amount: -100, date: '2026-09-10' }),
    ).toBe(false);
  });
});
