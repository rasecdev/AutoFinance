import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  criarToolAmortizarDivida,
  criarToolCriarDivida,
  criarToolQuitarDivida,
  criarToolRenegociar,
} from '../../../src/ai/tools/dividas.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarCartao } from '../../../src/db/repositories/cartoes.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { criarDivida, obterDivida } from '../../../src/db/repositories/dividas.js';
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

  it('recusa taxa_juros como porcentagem crua (ex: 2 em vez de 0.02) — achado real de teste manual', () => {
    const tool = criarToolCriarDivida(db);

    expect(() =>
      tool.schema.parse({
        conta_id: contaId,
        tipo: 'financiamento',
        valor_total: 12000,
        num_parcelas: 12,
        taxa_juros: 2,
        sistema_amortizacao: 'price',
        data_inicio: '2026-09-01',
      }),
    ).toThrow(/decimal mensal/);
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

describe('tool quitar_divida', () => {
  it('exige confirmação (alto impacto)', () => {
    const tool = criarToolQuitarDivida(db);
    expect(tool.requerConfirmacao).toBe(true);
  });

  it('paga todas as parcelas pendentes de uma vez e marca a dívida como quitado', async () => {
    const { divida } = criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 1000,
      numParcelas: 4,
      dataInicio: '2026-09-01',
    });

    const tool = criarToolQuitarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'emprestimo',
      data_pagamento: '2026-09-10',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    const atualizada = obterDivida(db, divida.id);
    expect(atualizada?.status).toBe('quitado');
    expect(atualizada?.parcelasPagas).toBe(4);
    const parcelasPendentes = db
      .prepare("SELECT COUNT(*) AS total FROM parcelas WHERE divida_id = ? AND status = 'pendente'")
      .get(divida.id) as { total: number };
    expect(parcelasPendentes.total).toBe(0);
    expect(resultado).toContain('4 parcela(s)');
    expect(resultado).toContain('R$ 1000.00');
    expect(resultado).toContain('2026-09-10');
    expect(resultado).not.toMatch(/\bid\b/i);
  });

  it('preserva parcelas já pagas — só quita as pendentes', async () => {
    const { divida } = criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 1200,
      numParcelas: 12,
      dataInicio: '2026-01-01',
    });
    db.prepare("UPDATE parcelas SET status = 'paga', data_pagamento = '2026-02-01' WHERE numero_parcela = 1").run();
    db.prepare('UPDATE dividas SET parcelas_pagas = 1 WHERE id = ?').run(divida.id);

    const tool = criarToolQuitarDivida(db);
    const args = tool.schema.parse({ conta_apelido: 'Principal', tipo_divida: 'financiamento' });

    const resultado = await tool.handler(args, { chatId: 1 });

    const atualizada = obterDivida(db, divida.id);
    expect(atualizada?.status).toBe('quitado');
    expect(atualizada?.parcelasPagas).toBe(12);
    expect(resultado).toContain('11 parcela(s)');
  });

  it('sem data_pagamento informada, usa a data de hoje', async () => {
    criarDivida(db, { contaId, tipo: 'outro', valorTotal: 500, numParcelas: 2, dataInicio: '2026-09-01' });

    const tool = criarToolQuitarDivida(db);
    const args = tool.schema.parse({ conta_apelido: 'Principal', tipo_divida: 'outro' });

    const resultado = await tool.handler(args, { chatId: 1 });

    const hoje = new Date();
    const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    expect(resultado).toContain(hojeISO);
  });

  it('dívida já quitada não é mais um alvo válido — mesma regra de conta+tipo das demais ferramentas', async () => {
    criarDivida(db, { contaId, tipo: 'emprestimo', valorTotal: 500, numParcelas: 1, dataInicio: '2026-09-01' });
    const primeira = criarToolQuitarDivida(db);
    await primeira.handler(
      primeira.schema.parse({ conta_apelido: 'Principal', tipo_divida: 'emprestimo' }),
      { chatId: 1 },
    );

    const tool = criarToolQuitarDivida(db);
    const args = tool.schema.parse({ conta_apelido: 'Principal', tipo_divida: 'emprestimo' });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não encontrei');
  });

  it('avisa quando não há dívida do tipo informado nessa conta', async () => {
    const tool = criarToolQuitarDivida(db);
    const args = tool.schema.parse({ conta_apelido: 'Principal', tipo_divida: 'financiamento' });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não encontrei');
  });
});

describe('tool amortizar_divida', () => {
  it('exige confirmação (alto impacto)', () => {
    const tool = criarToolAmortizarDivida(db);
    expect(tool.requerConfirmacao).toBe(true);
  });

  it('regressão: saldo devedor usado na estimativa é o principal real, não a soma nominal das parcelas pendentes (achado real de teste manual — R$1000 amortizados não reduziam nada)', () => {
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 12000,
      numParcelas: 12,
      taxaJuros: 0.02,
      sistemaAmortizacao: 'price',
      dataInicio: '2026-09-01',
    });

    const tool = criarToolAmortizarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'financiamento',
      valor: 1000,
      modo: 'reduzir_parcelas',
    });

    const aviso = tool.avisoConfirmacao?.(args);

    // Soma nominal das 12 parcelas seria ~R$13.616 (infla o saldo com juros
    // futuros); o saldo real é R$12.000 — só o cálculo correto reduz a
    // contagem de parcelas de 12 pra 11 com esse valor amortizado.
    expect(aviso).toContain('11 parcelas no total (11 restantes');
  });

  it('saldo devedor no sistema sac usa a amortização constante original (valor_total/num_parcelas)', () => {
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 1200,
      numParcelas: 12,
      taxaJuros: 0.03,
      sistemaAmortizacao: 'sac',
      dataInicio: '2026-09-01',
    });

    const tool = criarToolAmortizarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'financiamento',
      valor: 300,
      modo: 'reduzir_parcelas',
    });

    const aviso = tool.avisoConfirmacao?.(args);

    expect(aviso).toContain('9 parcelas no total (9 restantes');
  });

  it('avisoConfirmacao mostra a estimativa calculada (sistema price, modo reduzir_parcelas)', () => {
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 1000,
      numParcelas: 4,
      taxaJuros: 0,
      sistemaAmortizacao: 'price',
      dataInicio: '2026-09-01',
    });

    const tool = criarToolAmortizarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'financiamento',
      valor: 500,
      modo: 'reduzir_parcelas',
    });

    const aviso = tool.avisoConfirmacao?.(args);

    expect(aviso).toContain('Estimativa calculada');
    expect(aviso).toContain('sistema price');
    expect(aviso).toContain('2 parcelas no total (2 restantes de R$ 250.00 cada)');
  });

  it('avisoConfirmacao avisa que vai usar o valor informado, sem estimar, quando informado', () => {
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 1000,
      numParcelas: 4,
      taxaJuros: 0,
      sistemaAmortizacao: 'price',
      dataInicio: '2026-09-01',
    });

    const tool = criarToolAmortizarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'financiamento',
      valor: 500,
      modo: 'reduzir_parcelas',
      num_parcelas_informado: 3,
    });

    const aviso = tool.avisoConfirmacao?.(args);

    expect(aviso).toContain('valor real informado por você');
    expect(aviso).not.toContain('Estimativa');
  });

  it('avisoConfirmacao avisa quando o valor informado diverge muito da estimativa (achado real do usuário: "isso é o esperado?")', () => {
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 1000,
      numParcelas: 4,
      taxaJuros: 0,
      sistemaAmortizacao: 'price',
      dataInicio: '2026-09-01',
    });

    // Estimativa real pra esses parâmetros seria 2 parcelas restantes — informar
    // 4 (nenhuma redução) diverge 100%, bem acima do limite de 15%.
    const tool = criarToolAmortizarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'financiamento',
      valor: 500,
      modo: 'reduzir_parcelas',
      num_parcelas_informado: 4,
    });

    const aviso = tool.avisoConfirmacao?.(args);

    expect(aviso).toContain('diverge bastante');
    expect(aviso).toContain('100%');
    expect(aviso).toContain('2 parcelas');
    expect(aviso).toContain('taxa_juros ou o sistema_amortizacao');
  });

  it('avisoConfirmacao não avisa divergência quando o valor informado bate com a estimativa', () => {
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 1000,
      numParcelas: 4,
      taxaJuros: 0,
      sistemaAmortizacao: 'price',
      dataInicio: '2026-09-01',
    });

    const tool = criarToolAmortizarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'financiamento',
      valor: 500,
      modo: 'reduzir_parcelas',
      num_parcelas_informado: 2,
    });

    const aviso = tool.avisoConfirmacao?.(args);

    expect(aviso).not.toContain('diverge');
  });

  it('avisoConfirmacao não avisa divergência quando a dívida não tem sistema_amortizacao (nada pra comparar)', () => {
    criarDivida(db, { contaId, tipo: 'emprestimo', valorTotal: 1000, numParcelas: 4, dataInicio: '2026-09-01' });

    const tool = criarToolAmortizarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'emprestimo',
      valor: 500,
      modo: 'reduzir_parcelas',
      num_parcelas_informado: 4,
    });

    const aviso = tool.avisoConfirmacao?.(args);

    expect(aviso).not.toContain('diverge');
  });

  it('handler também ecoa o aviso de divergência no resultado final', async () => {
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 1000,
      numParcelas: 4,
      taxaJuros: 0,
      sistemaAmortizacao: 'price',
      dataInicio: '2026-09-01',
    });

    const tool = criarToolAmortizarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'financiamento',
      valor: 500,
      modo: 'reduzir_parcelas',
      num_parcelas_informado: 4,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('diverge bastante');
  });

  it('avisoConfirmacao pede o valor real quando a dívida não tem sistema_amortizacao e nada foi informado', () => {
    criarDivida(db, { contaId, tipo: 'emprestimo', valorTotal: 1000, numParcelas: 4, dataInicio: '2026-09-01' });

    const tool = criarToolAmortizarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'emprestimo',
      valor: 500,
      modo: 'reduzir_valor',
    });

    const aviso = tool.avisoConfirmacao?.(args);

    expect(aviso).toContain('não tem sistema de amortização');
    expect(aviso).toContain('valor_parcela_informado');
  });

  it('avisoConfirmacao inclui o aviso de dívida indexada quando indexador != fixo', () => {
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 1000,
      numParcelas: 4,
      taxaJuros: 0.01,
      sistemaAmortizacao: 'price',
      indexador: 'ipca',
      dataInicio: '2026-09-01',
    });

    const tool = criarToolAmortizarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'financiamento',
      valor: 200,
      modo: 'reduzir_valor',
    });

    const aviso = tool.avisoConfirmacao?.(args);

    expect(aviso).toContain('indexada a IPCA');
    expect(aviso).toContain('pode estar desatualizada');
  });

  it('avisoConfirmacao não menciona indexação quando indexador é fixo', () => {
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 1000,
      numParcelas: 4,
      taxaJuros: 0,
      sistemaAmortizacao: 'price',
      dataInicio: '2026-09-01',
    });

    const tool = criarToolAmortizarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'financiamento',
      valor: 500,
      modo: 'reduzir_parcelas',
    });

    const aviso = tool.avisoConfirmacao?.(args);

    expect(aviso).not.toContain('indexada');
  });

  it('handler aplica a estimativa calculada (modo reduzir_parcelas) e ecoa o resultado sem expor id', async () => {
    const { divida } = criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 1000,
      numParcelas: 4,
      taxaJuros: 0,
      sistemaAmortizacao: 'price',
      dataInicio: '2026-09-01',
      descricao: 'Financiamento Moto',
    });

    const tool = criarToolAmortizarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'financiamento',
      valor: 500,
      modo: 'reduzir_parcelas',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('amortizada em R$ 500.00');
    expect(resultado).toContain('estimativa, sistema price');
    expect(resultado).toContain('2 parcelas no total (2 restantes de R$ 250.00 cada)');
    expect(resultado).not.toMatch(/\bid\b/i);

    const atualizada = obterDivida(db, divida.id);
    expect(atualizada?.numParcelas).toBe(2);
  });

  it('handler aplica o valor real informado (modo reduzir_valor), ignorando o sistema_amortizacao cadastrado', async () => {
    const { divida } = criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 1000,
      numParcelas: 4,
      taxaJuros: 0,
      sistemaAmortizacao: 'price',
      dataInicio: '2026-09-01',
    });

    const tool = criarToolAmortizarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'financiamento',
      valor: 500,
      modo: 'reduzir_valor',
      valor_parcela_informado: 123.45,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('valor informado por você');
    expect(resultado).toContain('R$ 123.45');

    const atualizada = obterDivida(db, divida.id);
    expect(atualizada?.valorParcela).toBe(123.45);
  });

  it('handler não aplica nada e devolve mensagem quando falta sistema_amortizacao e valor informado', async () => {
    const { divida } = criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 1000,
      numParcelas: 4,
      dataInicio: '2026-09-01',
    });

    const tool = criarToolAmortizarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      tipo_divida: 'emprestimo',
      valor: 500,
      modo: 'reduzir_parcelas',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('não tem sistema de amortização');
    const atualizada = obterDivida(db, divida.id);
    expect(atualizada?.numParcelas).toBe(4);
  });

  it('avisa quando a conta não é encontrada', async () => {
    const tool = criarToolAmortizarDivida(db);
    const args = tool.schema.parse({
      conta_apelido: 'Inexistente',
      tipo_divida: 'emprestimo',
      valor: 500,
      modo: 'reduzir_valor',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não encontrei');
  });
});
