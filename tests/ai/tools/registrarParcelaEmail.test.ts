import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarToolRegistrarParcelaEmail } from '../../../src/ai/tools/registrarParcelaEmail.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { criarDivida } from '../../../src/db/repositories/dividas.js';
import { migrate } from '../../../src/db/migrate.js';
import { obterParcelaPorNumero } from '../../../src/db/repositories/parcelas.js';

const CHAVE_TESTE = 'chave-teste-tools-registrar-parcela-email';

let dir: string;
let db: DbClient;
let dividaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tools-registrar-parcela-email-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  const contaId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Principal' }).id;
  // 4 parcelas de 300, vencendo em 2026-10-01, 11-01, 12-01, 2027-01-01
  dividaId = criarDivida(db, {
    contaId,
    tipo: 'emprestimo',
    valorTotal: 1200,
    numParcelas: 4,
    dataInicio: '2026-09-01',
  }).divida.id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('tool registrar_parcela_email', () => {
  it('exige confirmação sempre', () => {
    const tool = criarToolRegistrarParcelaEmail(db);
    expect(tool.requerConfirmacao).toBe(true);
  });

  it('com número batendo, atualiza a parcela existente e grava origem=email + trace_id', async () => {
    const tool = criarToolRegistrarParcelaEmail(db);
    const args = tool.schema.parse({
      divida_id: dividaId,
      numero_parcela: 2,
      valor: 305,
      data_vencimento: '2026-11-02',
      trace_id: 'trace-teste-1',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('atualizada');
    const parcela = obterParcelaPorNumero(db, dividaId, 2);
    expect(parcela?.valor).toBe(305);
    expect(parcela?.dataVencimento).toBe('2026-11-02');

    const linha = db.prepare('SELECT origem, trace_id FROM parcelas WHERE id = ?').get(parcela?.id) as {
      origem: string;
      trace_id: string;
    };
    expect(linha.origem).toBe('email');
    expect(linha.trace_id).toBe('trace-teste-1');
  });

  it('sem correspondência e com número informado, cria parcela nova', async () => {
    const tool = criarToolRegistrarParcelaEmail(db);
    const args = tool.schema.parse({
      divida_id: dividaId,
      numero_parcela: 5,
      valor: 400,
      data_vencimento: '2027-02-01',
      trace_id: 'trace-teste-2',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('criada');
    const parcela = obterParcelaPorNumero(db, dividaId, 5);
    expect(parcela?.valor).toBe(400);
  });

  it('sem correspondência e sem número, não grava nada', async () => {
    const tool = criarToolRegistrarParcelaEmail(db);
    const args = tool.schema.parse({
      divida_id: dividaId,
      valor: 9999,
      data_vencimento: '2030-01-01',
      trace_id: 'trace-teste-3',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não gravei nada');
  });

  it('ambiguidade (mais de uma candidata) não grava nada', async () => {
    db.prepare(
      "INSERT INTO parcelas (divida_id, numero_parcela, valor, data_vencimento) VALUES (?, 5, 301, '2026-11-03')",
    ).run(dividaId);

    const tool = criarToolRegistrarParcelaEmail(db);
    const args = tool.schema.parse({
      divida_id: dividaId,
      valor: 300,
      data_vencimento: '2026-11-01',
      trace_id: 'trace-teste-4',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não gravei nada');
  });

  it('avisoConfirmacao deixa explícito se é atualização, criação ou ambiguidade', () => {
    const tool = criarToolRegistrarParcelaEmail(db);

    const argsAtualiza = tool.schema.parse({
      divida_id: dividaId,
      numero_parcela: 1,
      valor: 300,
      data_vencimento: '2026-10-01',
      trace_id: 't1',
    });
    expect(tool.avisoConfirmacao?.(argsAtualiza)).toContain('ATUALIZAR');

    const argsCria = tool.schema.parse({
      divida_id: dividaId,
      numero_parcela: 10,
      valor: 300,
      data_vencimento: '2028-01-01',
      trace_id: 't2',
    });
    expect(tool.avisoConfirmacao?.(argsCria)).toContain('CRIAR');
  });

  it('resumoConfirmacao resolve a dívida (tipo, já que não tem descrição), sem JSON', () => {
    const tool = criarToolRegistrarParcelaEmail(db);
    const args = tool.schema.parse({
      divida_id: dividaId,
      numero_parcela: 2,
      valor: 305,
      data_vencimento: '2026-11-02',
      trace_id: 'trace-teste-1',
    });

    const resumo = tool.resumoConfirmacao?.(args);

    expect(resumo).toBe('registrar parcela 2 da dívida "emprestimo", valor R$ 305.00, vencimento 2026-11-02');
    expect(resumo).not.toMatch(/[{}]/);
  });
});
