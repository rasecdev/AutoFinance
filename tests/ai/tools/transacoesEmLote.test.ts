import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarToolRegistrarTransacoesEmLote } from '../../../src/ai/tools/transacoesEmLote.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { migrate } from '../../../src/db/migrate.js';
import { listarTransacoesAtivas } from '../../../src/db/repositories/transacoes.js';

const CHAVE_TESTE = 'chave-teste-tools-transacoes-em-lote';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tools-transacoes-em-lote-test-'));
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

describe('tool registrar_transacoes_em_lote', () => {
  it('exige confirmação sempre (alto impacto, escrita em lote)', () => {
    const tool = criarToolRegistrarTransacoesEmLote(db);
    expect(tool.requerConfirmacao).toBe(true);
  });

  it('registra todas as transações vinculadas à mesma conta resolvida', async () => {
    const tool = criarToolRegistrarTransacoesEmLote(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      transacoes: [
        { tipo: 'despesa', valor: 45, categoria: 'Mercado', descricao: 'Mercado Central', data: '2026-09-10' },
        { tipo: 'receita', valor: 1000, categoria: 'Salário', data: '2026-09-05' },
      ],
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('2 transações');
    const extrato = listarTransacoesAtivas(db, { contaId });
    expect(extrato.length).toBe(2);
    expect(extrato.some((t) => t.categoria === 'Mercado' && t.valor === 45)).toBe(true);
    expect(extrato.some((t) => t.categoria === 'Salário' && t.valor === 1000)).toBe(true);
  });

  it('conta não resolvida retorna mensagem de erro, sem registrar nada', async () => {
    const tool = criarToolRegistrarTransacoesEmLote(db);
    const args = tool.schema.parse({
      conta_apelido: 'Conta Inexistente',
      transacoes: [{ tipo: 'despesa', valor: 45, categoria: 'Mercado', data: '2026-09-10' }],
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não encontrei');
    const extrato = listarTransacoesAtivas(db, { contaId });
    expect(extrato.length).toBe(0);
  });

  it('avisoConfirmacao resume quantidade e totais antes de confirmar', () => {
    const tool = criarToolRegistrarTransacoesEmLote(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      transacoes: [
        { tipo: 'despesa', valor: 100, categoria: 'Mercado', data: '2026-09-10' },
        { tipo: 'receita', valor: 50, categoria: 'Outros', data: '2026-09-11' },
      ],
    });

    const aviso = tool.avisoConfirmacao?.(args);

    expect(aviso).toContain('2 transações');
    expect(aviso).toContain('100.00');
    expect(aviso).toContain('50.00');
  });

  it('resumoConfirmacao descreve a ação em linguagem natural, sem JSON', () => {
    const tool = criarToolRegistrarTransacoesEmLote(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      transacoes: [
        { tipo: 'despesa', valor: 100, categoria: 'Mercado', data: '2026-09-10' },
        { tipo: 'receita', valor: 50, categoria: 'Outros', data: '2026-09-11' },
      ],
    });

    const resumo = tool.resumoConfirmacao?.(args);

    expect(resumo).toBe('registrar 2 transações na conta "Principal"');
    expect(resumo).not.toMatch(/[{}]/);
  });

  it('schema exige pelo menos 1 transação', () => {
    const tool = criarToolRegistrarTransacoesEmLote(db);

    expect(() => tool.schema.parse({ conta_apelido: 'Principal', transacoes: [] })).toThrow();
  });

  it('schema exige conta ou cartão informado', () => {
    const tool = criarToolRegistrarTransacoesEmLote(db);

    expect(() =>
      tool.schema.parse({ transacoes: [{ tipo: 'despesa', valor: 10, categoria: 'x', data: '2026-09-10' }] }),
    ).toThrow();
  });
});
