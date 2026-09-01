import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarToolCriarDivida } from '../../../src/ai/tools/dividas.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
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
