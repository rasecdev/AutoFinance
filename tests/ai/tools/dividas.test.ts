import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarToolCriarDivida, criarToolRenegociar } from '../../../src/ai/tools/dividas.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarCartao } from '../../../src/db/repositories/cartoes.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { criarDivida } from '../../../src/db/repositories/dividas.js';
import { migrate } from '../../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-tools-dividas';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tools-dividas-test-'));
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

describe('tool criar_divida', () => {
  it('exige confirmação (alto impacto)', () => {
    const tool = criarToolCriarDivida(db);
    expect(tool.requerConfirmacao).toBe(true);
  });

  it('grava e ecoa a dívida sem expor id bruto', async () => {
    const tool = criarToolCriarDivida(db);
    const args = tool.schema.parse({
      conta_id: contaId,
      tipo: 'financiamento',
      valor_total: 12000,
      num_parcelas: 12,
      data_inicio: '2026-09-01',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('financiamento');
    expect(resultado).toContain('R$ 12000.00');
    expect(resultado).toContain('12 parcelas');
    expect(resultado).not.toMatch(/\bid\b/i);
  });

  it('resolve a conta pelo apelido', async () => {
    const tool = criarToolCriarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo: 'emprestimo',
      valor_total: 1000,
      num_parcelas: 4,
      data_inicio: '2026-09-01',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('conta "Principal"');
  });

  it('sem data_inicio informada, usa a data de hoje', async () => {
    const tool = criarToolCriarDivida(db);
    const args = tool.schema.parse({
      conta_id: contaId,
      tipo: 'outro',
      valor_total: 500,
      num_parcelas: 2,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    const hoje = new Date();
    const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    expect(resultado).toContain(hojeISO);
  });

  it('aceita ausência de campos opcionais (sistema_amortizacao, indexador etc.) sem erro', async () => {
    const tool = criarToolCriarDivida(db);
    const args = tool.schema.parse({
      conta_id: contaId,
      tipo: 'consignado',
      valor_total: 2000,
      num_parcelas: 10,
      data_inicio: '2026-09-01',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('consignado');
    expect(resultado).not.toContain('undefined');
  });

  it('com sistema_amortizacao sac, mensagem indica parcela inicial decrescente', async () => {
    const tool = criarToolCriarDivida(db);
    const args = tool.schema.parse({
      conta_id: contaId,
      tipo: 'financiamento',
      valor_total: 12000,
      num_parcelas: 12,
      taxa_juros: 0.02,
      sistema_amortizacao: 'sac',
      data_inicio: '2026-09-01',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('parcela inicial de');
    expect(resultado).toContain('decrescente');
    expect(resultado).toContain('sistema sac');
    expect(resultado).toContain('taxa 2.00% a.m.');
    expect(resultado).toMatch(/total com juros R\$ \d/);
  });

  it('sem juros (sem taxa_juros/sistema_amortizacao), não menciona total com juros', async () => {
    const tool = criarToolCriarDivida(db);
    const args = tool.schema.parse({
      conta_id: contaId,
      tipo: 'emprestimo',
      valor_total: 1000,
      num_parcelas: 4,
      data_inicio: '2026-09-01',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).not.toContain('total com juros');
  });

  it('avisa quando a conta não é encontrada', async () => {
    const tool = criarToolCriarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Inexistente',
      tipo: 'emprestimo',
      valor_total: 500,
      num_parcelas: 2,
      data_inicio: '2026-09-01',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não encontrei');
  });
});

describe('tool renegociar', () => {
  it('exige confirmação (alto impacto)', () => {
    const tool = criarToolRenegociar(db);
    expect(tool.requerConfirmacao).toBe(true);
  });

  it('a partir de uma dívida (conta + tipo, sem id): marca a origem como renegociada e a nova dívida herda o tipo', async () => {
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 10000,
      numParcelas: 10,
      dataInicio: '2026-09-01',
    });

    const tool = criarToolRenegociar(db);
    const args = tool.schema.parse({
      origem: 'divida',
      conta_apelido: 'Principal',
      tipo_divida: 'financiamento',
      valor_total: 8000,
      num_parcelas: 12,
      data_inicio: '2026-09-01',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    const dividas = db.prepare("SELECT status FROM dividas WHERE tipo = 'financiamento'").all() as {
      status: string;
    }[];
    expect(dividas.some((d) => d.status === 'renegociado')).toBe(true);
    expect(resultado).toContain('dívida original marcada como renegociada');
    expect(resultado).toContain('financiamento');
    expect(resultado).toContain('R$ 8000.00');
    expect(resultado).not.toMatch(/\bid\b/i);
  });

  it('a partir de uma fatura (cartão + mês, sem id): usa tipo "outro" e marca a fatura como renegociada', async () => {
    const cartaoId = criarCartao(db, {
      contaId,
      nome: 'Nubank',
      limite: 5000,
      diaFechamento: 5,
      diaVencimento: 10,
    }).id;
    db.prepare(
      "INSERT INTO faturas (cartao_id, mes_referencia, valor, status) VALUES (?, '2026-08', 1500, 'aberta')",
    ).run(cartaoId);

    const tool = criarToolRenegociar(db);
    const args = tool.schema.parse({
      origem: 'fatura',
      cartao_nome: 'Nubank',
      mes_referencia: '2026-08',
      valor_total: 1500,
      num_parcelas: 6,
      data_inicio: '2026-09-01',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    const fatura = db.prepare('SELECT status FROM faturas WHERE cartao_id = ?').get(cartaoId) as {
      status: string;
    };
    expect(fatura.status).toBe('renegociada');
    expect(resultado).toContain('fatura original marcada como renegociada');
    expect(resultado).toContain('outro');
    expect(resultado).not.toMatch(/\bid\b/i);
  });

  it('recusa origem "divida" sem conta ou sem tipo_divida', () => {
    const tool = criarToolRenegociar(db);

    expect(() => tool.schema.parse({ origem: 'divida', valor_total: 100, num_parcelas: 1 })).toThrow();
    expect(() =>
      tool.schema.parse({ origem: 'divida', conta_apelido: 'Principal', valor_total: 100, num_parcelas: 1 }),
    ).toThrow();
  });

  it('recusa origem "fatura" sem cartão ou sem mes_referencia', () => {
    const tool = criarToolRenegociar(db);

    expect(() => tool.schema.parse({ origem: 'fatura', valor_total: 100, num_parcelas: 1 })).toThrow();
    expect(() =>
      tool.schema.parse({ origem: 'fatura', cartao_nome: 'Nubank', valor_total: 100, num_parcelas: 1 }),
    ).toThrow();
  });

  it('avisa quando não há dívida do tipo informado nessa conta', async () => {
    const tool = criarToolRenegociar(db);
    const args = tool.schema.parse({
      origem: 'divida',
      conta_apelido: 'Principal',
      tipo_divida: 'consignado',
      valor_total: 100,
      num_parcelas: 1,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não encontrei');
  });

  it('pede pra desambiguar quando há mais de uma dívida do mesmo tipo na conta', async () => {
    criarDivida(db, { contaId, tipo: 'emprestimo', valorTotal: 1000, numParcelas: 4, dataInicio: '2026-09-01' });
    criarDivida(db, { contaId, tipo: 'emprestimo', valorTotal: 2000, numParcelas: 6, dataInicio: '2026-09-01' });

    const tool = criarToolRenegociar(db);
    const args = tool.schema.parse({
      origem: 'divida',
      conta_apelido: 'Principal',
      tipo_divida: 'emprestimo',
      valor_total: 900,
      num_parcelas: 6,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('mais de uma dívida');
  });

  it('desambigua pela divida_descricao quando informada', async () => {
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
      tipo: 'emprestimo',
      valorTotal: 2000,
      numParcelas: 6,
      dataInicio: '2026-09-01',
      descricao: 'Reforma',
    });

    const tool = criarToolRenegociar(db);
    const args = tool.schema.parse({
      origem: 'divida',
      conta_apelido: 'Principal',
      tipo_divida: 'emprestimo',
      divida_descricao: 'Carro',
      valor_total: 900,
      num_parcelas: 6,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('dívida original marcada como renegociada');
    expect(resultado).not.toContain('mais de uma dívida');
  });

  it('avisa quando a fatura não é encontrada nesse cartão/mês', async () => {
    criarCartao(db, { contaId, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 });

    const tool = criarToolRenegociar(db);
    const args = tool.schema.parse({
      origem: 'fatura',
      cartao_nome: 'Nubank',
      mes_referencia: '2026-08',
      valor_total: 100,
      num_parcelas: 1,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não encontrei');
  });

  it('grava o motivo quando informado', async () => {
    criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 1000,
      numParcelas: 4,
      dataInicio: '2026-09-01',
    });

    const tool = criarToolRenegociar(db);
    const args = tool.schema.parse({
      origem: 'divida',
      conta_apelido: 'Principal',
      tipo_divida: 'emprestimo',
      valor_total: 900,
      num_parcelas: 6,
      motivo: 'taxa mais baixa',
      data_inicio: '2026-09-01',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('motivo "taxa mais baixa"');
  });

  it('com taxa_juros na nova dívida, mensagem mostra o total pago com juros', async () => {
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 10000,
      numParcelas: 10,
      dataInicio: '2026-09-01',
    });

    const tool = criarToolRenegociar(db);
    const args = tool.schema.parse({
      origem: 'divida',
      conta_apelido: 'Principal',
      tipo_divida: 'financiamento',
      valor_total: 8000,
      num_parcelas: 12,
      taxa_juros: 0.015,
      sistema_amortizacao: 'price',
      data_inicio: '2026-09-01',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toMatch(/total com juros R\$ \d/);
  });

  it('sem taxa_juros/sistema_amortizacao informados, herda da dívida original (achado real do usuário)', async () => {
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 12000,
      numParcelas: 12,
      taxaJuros: 0.02,
      sistemaAmortizacao: 'price',
      dataInicio: '2026-09-01',
    });

    const tool = criarToolRenegociar(db);
    const args = tool.schema.parse({
      origem: 'divida',
      conta_apelido: 'Principal',
      tipo_divida: 'financiamento',
      valor_total: 8000,
      num_parcelas: 12,
      data_inicio: '2026-09-01',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('sistema price');
    expect(resultado).toContain('taxa 2.00% a.m.');
    expect(resultado).toMatch(/total com juros R\$ \d/);
  });

  it('com taxa_juros informada explicitamente, usa o valor novo em vez de herdar', async () => {
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 12000,
      numParcelas: 12,
      taxaJuros: 0.02,
      sistemaAmortizacao: 'price',
      dataInicio: '2026-09-01',
    });

    const tool = criarToolRenegociar(db);
    const args = tool.schema.parse({
      origem: 'divida',
      conta_apelido: 'Principal',
      tipo_divida: 'financiamento',
      valor_total: 8000,
      num_parcelas: 12,
      taxa_juros: 0.01,
      data_inicio: '2026-09-01',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('sistema price');
    expect(resultado).toContain('taxa 1.00% a.m.');
  });

  it('renegociação a partir de fatura não herda nada (fatura não tem taxa_juros/sistema)', async () => {
    criarCartao(db, { contaId, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 });
    db.prepare(
      "INSERT INTO faturas (cartao_id, mes_referencia, valor, status) VALUES ((SELECT id FROM cartoes WHERE nome = 'Nubank'), '2026-08', 1500, 'aberta')",
    ).run();

    const tool = criarToolRenegociar(db);
    const args = tool.schema.parse({
      origem: 'fatura',
      cartao_nome: 'Nubank',
      mes_referencia: '2026-08',
      valor_total: 1500,
      num_parcelas: 6,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).not.toContain('sistema');
    expect(resultado).not.toContain('taxa');
  });

  it('mes_referencia só com o mês (sem ano): completa com o ano atual, nunca inventado pelo modelo', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    try {
      criarCartao(db, { contaId, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 });
      db.prepare(
        "INSERT INTO faturas (cartao_id, mes_referencia, valor, status) VALUES ((SELECT id FROM cartoes WHERE nome = 'Nubank'), '2026-08', 1500, 'aberta')",
      ).run();

      const tool = criarToolRenegociar(db);
      const args = tool.schema.parse({
        origem: 'fatura',
        cartao_nome: 'Nubank',
        mes_referencia: '08',
        valor_total: 1500,
        num_parcelas: 6,
      });

      const resultado = await tool.handler(args, { chatId: 1 });

      expect(resultado).toContain('fatura original marcada como renegociada');
    } finally {
      vi.useRealTimers();
    }
  });
});
