import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarToolPagarFatura, criarToolPagarParcela } from '../../../src/ai/tools/pagamentos.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarCartao } from '../../../src/db/repositories/cartoes.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { criarDivida } from '../../../src/db/repositories/dividas.js';
import { migrate } from '../../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-tools-pagamentos';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tools-pagamentos-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Principal' }).id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('tool pagar_parcela', () => {
  it('não exige confirmação (rotina, baixo impacto)', () => {
    const tool = criarToolPagarParcela(db);
    expect(tool.requerConfirmacao).toBeUndefined();
  });

  it('sem numero_parcela, paga a parcela pendente mais antiga', async () => {
    criarDivida(db, { contaId, tipo: 'emprestimo', valorTotal: 400, numParcelas: 4, dataInicio: '2026-09-01' });

    const tool = criarToolPagarParcela(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'emprestimo',
      data_pagamento: '2026-10-05',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Parcela 1/4 paga');
    expect(resultado).toContain('1/4 parcelas pagas');
    expect(resultado).not.toContain('quitada');
  });

  it('com numero_parcela, paga exatamente essa parcela (antecipação fora de ordem)', async () => {
    criarDivida(db, { contaId, tipo: 'emprestimo', valorTotal: 400, numParcelas: 4, dataInicio: '2026-09-01' });

    const tool = criarToolPagarParcela(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'emprestimo',
      numero_parcela: 3,
      data_pagamento: '2026-10-05',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Parcela 3/4 paga');
  });

  it('paga a última parcela e a dívida quita sozinha', async () => {
    criarDivida(db, { contaId, tipo: 'emprestimo', valorTotal: 100, numParcelas: 1, dataInicio: '2026-09-01' });

    const tool = criarToolPagarParcela(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'emprestimo',
      data_pagamento: '2026-10-05',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('dívida quitada');
  });

  it('avisa quando a parcela informada já está paga', async () => {
    criarDivida(db, { contaId, tipo: 'emprestimo', valorTotal: 400, numParcelas: 4, dataInicio: '2026-09-01' });
    const tool = criarToolPagarParcela(db);

    await tool.handler(
      tool.schema.parse({ conta_apelido: 'Principal', tipo_divida: 'emprestimo', numero_parcela: 1 }),
      { chatId: 1 },
    );
    const resultado = await tool.handler(
      tool.schema.parse({ conta_apelido: 'Principal', tipo_divida: 'emprestimo', numero_parcela: 1 }),
      { chatId: 1 },
    );

    expect(resultado).toContain('já estava paga');
  });

  it('avisa quando não há parcela com o número informado', async () => {
    criarDivida(db, { contaId, tipo: 'emprestimo', valorTotal: 400, numParcelas: 4, dataInicio: '2026-09-01' });

    const tool = criarToolPagarParcela(db);
    const args = tool.schema.parse({ conta_apelido: 'Principal', tipo_divida: 'emprestimo', numero_parcela: 99 });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não encontrei a parcela 99');
  });

  it('avisa quando a dívida não é encontrada', async () => {
    const tool = criarToolPagarParcela(db);
    const args = tool.schema.parse({ conta_apelido: 'Principal', tipo_divida: 'financiamento' });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não encontrei');
  });
});

describe('tool pagar_fatura', () => {
  it('não exige confirmação (rotina, baixo impacto)', () => {
    const tool = criarToolPagarFatura(db);
    expect(tool.requerConfirmacao).toBeUndefined();
  });

  it('marca a fatura como paga com a data informada', async () => {
    const cartaoId = criarCartao(db, { contaId, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 }).id;
    db.prepare("INSERT INTO faturas (cartao_id, mes_referencia, valor, status) VALUES (?, '2026-08', 1500, 'aberta')").run(
      cartaoId,
    );

    const tool = criarToolPagarFatura(db);
    const args = tool.schema.parse({ cartao_nome: 'Nubank', mes_referencia: '2026-08', data_pagamento: '2026-08-09' });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Fatura de 2026-08 paga');
    expect(resultado).toContain('R$ 1500.00');
    expect(resultado).toContain('2026-08-09');
  });

  it('mes_referencia só com o mês (sem ano): completa com o ano atual, nunca inventado pelo modelo', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    try {
      const cartaoId = criarCartao(db, { contaId, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 }).id;
      db.prepare("INSERT INTO faturas (cartao_id, mes_referencia, valor, status) VALUES (?, '2026-08', 850, 'aberta')").run(
        cartaoId,
      );

      const tool = criarToolPagarFatura(db);
      const args = tool.schema.parse({ cartao_nome: 'Nubank', mes_referencia: '08' });

      const resultado = await tool.handler(args, { chatId: 1 });

      expect(resultado).toContain('Fatura de 2026-08 paga');
    } finally {
      vi.useRealTimers();
    }
  });

  it('sem data_pagamento informada, usa a data de hoje', async () => {
    const cartaoId = criarCartao(db, { contaId, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 }).id;
    db.prepare("INSERT INTO faturas (cartao_id, mes_referencia, valor, status) VALUES (?, '2026-08', 1500, 'aberta')").run(
      cartaoId,
    );

    const tool = criarToolPagarFatura(db);
    const args = tool.schema.parse({ cartao_nome: 'Nubank', mes_referencia: '2026-08' });

    const resultado = await tool.handler(args, { chatId: 1 });

    const hoje = new Date();
    const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    expect(resultado).toContain(hojeISO);
  });

  it('avisa quando a fatura já está paga', async () => {
    const cartaoId = criarCartao(db, { contaId, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 }).id;
    db.prepare("INSERT INTO faturas (cartao_id, mes_referencia, valor, status) VALUES (?, '2026-08', 1500, 'aberta')").run(
      cartaoId,
    );
    const tool = criarToolPagarFatura(db);
    const args = tool.schema.parse({ cartao_nome: 'Nubank', mes_referencia: '2026-08' });
    await tool.handler(args, { chatId: 1 });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('já estava paga');
  });

  it('avisa quando a fatura não é encontrada nesse cartão/mês', async () => {
    criarCartao(db, { contaId, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 });

    const tool = criarToolPagarFatura(db);
    const args = tool.schema.parse({ cartao_nome: 'Nubank', mes_referencia: '2026-08' });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não encontrei');
  });
});
