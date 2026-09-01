import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  criarToolEditarTransacao,
  criarToolExcluirTransacao,
  criarToolRegistrarTransacao,
} from '../../../src/ai/tools/transacoes.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarCartao } from '../../../src/db/repositories/cartoes.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { criarTransacao, obterTransacao } from '../../../src/db/repositories/transacoes.js';
import { migrate } from '../../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-tools-transacoes';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tools-transacoes-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Conta principal' }).id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('tool registrar_transacao', () => {
  it('não exige confirmação (baixo impacto)', () => {
    const tool = criarToolRegistrarTransacao(db);
    expect(tool.requerConfirmacao).toBeUndefined();
  });

  it('rejeita quando nem conta_id nem cartao_id são informados', () => {
    const tool = criarToolRegistrarTransacao(db);
    const validacao = tool.schema.safeParse({
      tipo: 'despesa',
      valor: 50,
      categoria: 'Alimentação',
      data: '2026-08-31',
    });
    expect(validacao.success).toBe(false);
  });

  it('grava e ecoa valor/categoria/data', async () => {
    const tool = criarToolRegistrarTransacao(db);
    const args = tool.schema.parse({
      conta_id: contaId,
      tipo: 'despesa',
      valor: 42.5,
      categoria: 'Alimentação',
      data: '2026-08-31',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('42.50');
    expect(resultado).toContain('Alimentação');
    expect(resultado).toContain('2026-08-31');
    expect(resultado).not.toMatch(/\bid\b/i);
  });

  it('sem data informada, usa a data de hoje (o modelo não tem noção de data real)', async () => {
    const tool = criarToolRegistrarTransacao(db);
    const args = tool.schema.parse({
      conta_id: contaId,
      tipo: 'despesa',
      valor: 10,
      categoria: 'Alimentação',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    const hoje = new Date();
    const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    expect(resultado).toContain(hojeISO);
  });

  it('grava resolvendo a conta pelo apelido', async () => {
    const tool = criarToolRegistrarTransacao(db);
    const args = tool.schema.parse({
      conta_apelido: 'conta principal',
      tipo: 'despesa',
      valor: 20,
      categoria: 'Transporte',
      data: '2026-08-31',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).not.toMatch(/\bid\b/i);
  });

  it('avisa quando o apelido da conta não é encontrado', async () => {
    const tool = criarToolRegistrarTransacao(db);
    const args = tool.schema.parse({
      conta_apelido: 'Inexistente',
      tipo: 'despesa',
      valor: 20,
      categoria: 'Transporte',
      data: '2026-08-31',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não encontrei');
  });

  it('quando não encontra o cartão pelo nome, sugere os cartões que já existem', async () => {
    criarCartao(db, { contaId, nome: 'Roxinho', limite: 1000, diaFechamento: 5, diaVencimento: 12 });

    const tool = criarToolRegistrarTransacao(db);
    const args = tool.schema.parse({
      cartao_nome: 'Inexistente',
      tipo: 'despesa',
      valor: 20,
      categoria: 'Transporte',
      data: '2026-08-31',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Cartões existentes');
    expect(resultado).toContain('Roxinho');
  });
});

describe('tool editar_transacao', () => {
  it('rejeita quando nenhum campo de alteração é informado', () => {
    const tool = criarToolEditarTransacao(db);
    const validacao = tool.schema.safeParse({ id: 1 });
    expect(validacao.success).toBe(false);
  });

  it('avisa quando a transação não existe, sem lançar exceção', async () => {
    const tool = criarToolEditarTransacao(db);
    const args = tool.schema.parse({ id: 9999, valor: 10 });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não encontrei');
  });

  it('atualiza e ecoa o que mudou', async () => {
    const transacao = criarTransacao(db, {
      contaId,
      tipo: 'despesa',
      valor: 50,
      categoria: 'Alimentação',
      data: '2026-08-31',
    });

    const tool = criarToolEditarTransacao(db);
    const args = tool.schema.parse({ id: transacao.id, valor: 75, categoria: 'Transporte' });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('valor, categoria');
    expect(resultado).toContain('75.00');
    expect(resultado).toContain('Transporte');
    expect(resultado).not.toMatch(/\bid\b/i);
  });

  it('sem id, edita a última transação registrada naquele chat', async () => {
    const toolRegistrar = criarToolRegistrarTransacao(db);
    const argsRegistrar = toolRegistrar.schema.parse({
      conta_id: contaId,
      tipo: 'despesa',
      valor: 50,
      categoria: 'Alimentação',
      data: '2026-08-31',
    });
    await toolRegistrar.handler(argsRegistrar, { chatId: 42 });

    const toolEditar = criarToolEditarTransacao(db);
    const argsEditar = toolEditar.schema.parse({ valor: 99 });
    const resultado = await toolEditar.handler(argsEditar, { chatId: 42 });

    expect(resultado).toContain('99.00');
  });

  it('sem id e sem última transação rastreada naquele chat, pede a informação', async () => {
    const tool = criarToolEditarTransacao(db);
    const args = tool.schema.parse({ valor: 10 });

    const resultado = await tool.handler(args, { chatId: 999 });

    expect(resultado).toContain('Não sei qual transação');
  });
});

describe('tool excluir_transacao', () => {
  it('é marcada como alto impacto (requerConfirmacao)', () => {
    const tool = criarToolExcluirTransacao(db);
    expect(tool.requerConfirmacao).toBe(true);
  });

  it('avisa quando a transação não existe, sem lançar exceção', async () => {
    const tool = criarToolExcluirTransacao(db);
    const args = tool.schema.parse({ id: 9999 });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não encontrei');
  });

  it('exclui logicamente (status = excluida), nunca remove a linha', async () => {
    const transacao = criarTransacao(db, {
      contaId,
      tipo: 'despesa',
      valor: 50,
      categoria: 'Alimentação',
      data: '2026-08-31',
    });

    const tool = criarToolExcluirTransacao(db);
    const args = tool.schema.parse({ id: transacao.id });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('excluída');
    expect(resultado).toContain('50.00');
    expect(resultado).not.toMatch(/\bid\b/i);
    expect(obterTransacao(db, transacao.id)).toMatchObject({ status: 'excluida' });
  });

  it('sem id, exclui a última transação registrada naquele chat', async () => {
    const toolRegistrar = criarToolRegistrarTransacao(db);
    const argsRegistrar = toolRegistrar.schema.parse({
      conta_id: contaId,
      tipo: 'despesa',
      valor: 50,
      categoria: 'Alimentação',
      data: '2026-08-31',
    });
    await toolRegistrar.handler(argsRegistrar, { chatId: 43 });

    const toolExcluir = criarToolExcluirTransacao(db);
    const args = toolExcluir.schema.parse({});
    const resultado = await toolExcluir.handler(args, { chatId: 43 });

    expect(resultado).toContain('excluída');
  });

  it('sem id e sem última transação rastreada naquele chat, pede a informação', async () => {
    const tool = criarToolExcluirTransacao(db);
    const args = tool.schema.parse({});

    const resultado = await tool.handler(args, { chatId: 998 });

    expect(resultado).toContain('Não sei qual transação');
  });
});
