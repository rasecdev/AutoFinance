import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  criarToolConsultarDividasAtivas,
  criarToolConsultarFatura,
  criarToolResumoDividas,
} from '../../../src/ai/tools/consultasDividas.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarCartao } from '../../../src/db/repositories/cartoes.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { criarDivida, marcarDividaRenegociada, quitarDivida } from '../../../src/db/repositories/dividas.js';
import { migrate } from '../../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-tools-consultas-dividas';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tools-consultas-dividas-test-'));
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

describe('tool consultar_fatura', () => {
  it('não exige confirmação (consulta)', () => {
    const tool = criarToolConsultarFatura(db);
    expect(tool.requerConfirmacao).toBeUndefined();
  });

  it('retorna a fatura de um cartão/mês específico', async () => {
    const cartaoId = criarCartao(db, { contaId, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 }).id;
    db.prepare("INSERT INTO faturas (cartao_id, mes_referencia, valor, status) VALUES (?, '2026-08', 1500, 'aberta')").run(
      cartaoId,
    );

    const tool = criarToolConsultarFatura(db);
    const args = tool.schema.parse({ cartao_nome: 'Nubank', mes_referencia: '2026-08' });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('R$ 1500.00');
    expect(resultado).toContain('em aberto');
  });

  it('mostra a data de pagamento quando a fatura já foi paga', async () => {
    const cartaoId = criarCartao(db, { contaId, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 }).id;
    db.prepare(
      "INSERT INTO faturas (cartao_id, mes_referencia, valor, status, data_pagamento) VALUES (?, '2026-08', 1500, 'paga', '2026-08-10')",
    ).run(cartaoId);

    const tool = criarToolConsultarFatura(db);
    const args = tool.schema.parse({ cartao_nome: 'Nubank', mes_referencia: '2026-08' });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('paga em 2026-08-10');
  });

  it('avisa quando não encontra a fatura', async () => {
    criarCartao(db, { contaId, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 });

    const tool = criarToolConsultarFatura(db);
    const args = tool.schema.parse({ cartao_nome: 'Nubank', mes_referencia: '2026-08' });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não encontrei fatura');
  });

  it('mes_referencia só com o mês (sem ano): completa com o ano atual', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    try {
      const cartaoId = criarCartao(db, { contaId, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 }).id;
      db.prepare("INSERT INTO faturas (cartao_id, mes_referencia, valor, status) VALUES (?, '2026-08', 1500, 'aberta')").run(
        cartaoId,
      );

      const tool = criarToolConsultarFatura(db);
      const args = tool.schema.parse({ cartao_nome: 'Nubank', mes_referencia: '08' });

      const resultado = await tool.handler(args, { chatId: 1 });

      expect(resultado).toContain('R$ 1500.00');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('tool consultar_dividas_ativas', () => {
  it('não exige confirmação (consulta)', () => {
    const tool = criarToolConsultarDividasAtivas(db);
    expect(tool.requerConfirmacao).toBeUndefined();
  });

  it('lista as dívidas ativas com próxima parcela a vencer', async () => {
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 12000,
      numParcelas: 12,
      dataInicio: '2026-09-01',
      descricao: 'Financiamento Moto',
    });

    const tool = criarToolConsultarDividasAtivas(db);
    const args = tool.schema.parse({});

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('1 dívida(s) ativa(s)');
    expect(resultado).toContain('Financiamento Moto');
    expect(resultado).toContain('R$ 12000.00 total');
    expect(resultado).toContain('0/12 parcelas pagas');
    expect(resultado).toContain('próxima parcela 1/12');
    expect(resultado).not.toMatch(/\bid\b/i);
  });

  it('nunca lista dívida quitada ou renegociada', async () => {
    const { divida: quitada } = criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 500,
      numParcelas: 1,
      dataInicio: '2026-09-01',
    });
    quitarDivida(db, quitada.id, '2026-09-05');

    const { divida: renegociada } = criarDivida(db, {
      contaId,
      tipo: 'consignado',
      valorTotal: 800,
      numParcelas: 2,
      dataInicio: '2026-09-01',
    });
    marcarDividaRenegociada(db, renegociada.id);

    const tool = criarToolConsultarDividasAtivas(db);
    const resultado = await tool.handler(tool.schema.parse({}), { chatId: 1 });

    expect(resultado).toContain('Nenhuma dívida ativa');
  });

  it('filtra por conta quando informada', async () => {
    criarDivida(db, { contaId, tipo: 'emprestimo', valorTotal: 1000, numParcelas: 4, dataInicio: '2026-09-01' });
    const outraContaId = criarConta(db, { bancoNome: 'Bradesco', tipo: 'PF', apelido: 'Outra' }).id;
    criarDivida(db, { contaId: outraContaId, tipo: 'financiamento', valorTotal: 2000, numParcelas: 4, dataInicio: '2026-09-01' });

    const tool = criarToolConsultarDividasAtivas(db);
    const resultado = await tool.handler(tool.schema.parse({ conta_apelido: 'Principal' }), { chatId: 1 });

    expect(resultado).toContain('emprestimo');
    expect(resultado).not.toContain('financiamento');
    expect(resultado).toContain('na conta "Principal"');
  });

  it('avisa quando a conta não é encontrada', async () => {
    const tool = criarToolConsultarDividasAtivas(db);
    const resultado = await tool.handler(tool.schema.parse({ conta_apelido: 'Inexistente' }), { chatId: 1 });

    expect(resultado).toContain('Não encontrei');
  });
});

describe('tool resumo_dividas', () => {
  it('não exige confirmação (consulta)', () => {
    const tool = criarToolResumoDividas(db);
    expect(tool.requerConfirmacao).toBeUndefined();
  });

  it('agrega saldo devedor total e lista as próximas parcelas a vencer', async () => {
    criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 1000,
      numParcelas: 4,
      dataInicio: '2026-09-01',
      descricao: 'Carro',
    });
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 2000,
      numParcelas: 2,
      dataInicio: '2026-08-01',
      descricao: 'Reforma',
    });

    const tool = criarToolResumoDividas(db);
    const resultado = await tool.handler(tool.schema.parse({}), { chatId: 1 });

    expect(resultado).toContain('2 dívida(s)');
    expect(resultado).toContain('R$ 3000.00');
    expect(resultado).toContain('Próximas parcelas a vencer');
    expect(resultado).not.toMatch(/\bid\b/i);
  });

  it('ordena as próximas parcelas por data de vencimento entre dívidas diferentes', async () => {
    criarDivida(db, { contaId, tipo: 'emprestimo', valorTotal: 400, numParcelas: 4, dataInicio: '2026-09-01', descricao: 'Tarde' });
    criarDivida(db, { contaId, tipo: 'financiamento', valorTotal: 400, numParcelas: 4, dataInicio: '2026-07-01', descricao: 'Cedo' });

    const tool = criarToolResumoDividas(db);
    const resultado = await tool.handler(tool.schema.parse({}), { chatId: 1 });

    const indiceCedo = resultado.indexOf('"Cedo"');
    const indiceTarde = resultado.indexOf('"Tarde"');
    expect(indiceCedo).toBeGreaterThan(-1);
    expect(indiceTarde).toBeGreaterThan(-1);
    expect(indiceCedo).toBeLessThan(indiceTarde);
  });

  it('limita a 5 próximas parcelas mesmo com mais pendentes', async () => {
    criarDivida(db, { contaId, tipo: 'emprestimo', valorTotal: 1200, numParcelas: 12, dataInicio: '2026-09-01' });

    const tool = criarToolResumoDividas(db);
    const resultado = await tool.handler(tool.schema.parse({}), { chatId: 1 });

    const ocorrencias = resultado.split('\n').filter((linha) => linha.startsWith('- emprestimo'));
    expect(ocorrencias).toHaveLength(5);
  });

  it('sem dívida ativa, avisa sem inventar dado', async () => {
    const tool = criarToolResumoDividas(db);
    const resultado = await tool.handler(tool.schema.parse({}), { chatId: 1 });

    expect(resultado).toContain('Nenhuma dívida ativa');
  });

  it('filtra por conta quando informada', async () => {
    criarDivida(db, { contaId, tipo: 'emprestimo', valorTotal: 1000, numParcelas: 4, dataInicio: '2026-09-01' });
    const outraContaId = criarConta(db, { bancoNome: 'Bradesco', tipo: 'PF', apelido: 'Outra' }).id;
    criarDivida(db, { contaId: outraContaId, tipo: 'financiamento', valorTotal: 5000, numParcelas: 4, dataInicio: '2026-09-01' });

    const tool = criarToolResumoDividas(db);
    const resultado = await tool.handler(tool.schema.parse({ conta_apelido: 'Principal' }), { chatId: 1 });

    expect(resultado).toContain('1 dívida(s)');
    expect(resultado).toContain('R$ 1000.00');
  });
});
