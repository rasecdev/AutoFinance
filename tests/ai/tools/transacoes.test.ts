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
import { buscarCategoriaCache } from '../../../src/db/repositories/cacheCategorizacao.js';
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

  it('descrição nova + categoria informada: grava a categoria da IA e cria linha no cache com origem ia', async () => {
    const tool = criarToolRegistrarTransacao(db);
    const args = tool.schema.parse({
      conta_id: contaId,
      tipo: 'despesa',
      valor: 30,
      categoria: 'Transporte',
      descricao: 'Uber',
      data: '2026-08-31',
    });

    const resultado = await tool.handler(args, { chatId: 1, modelo: 'openai/gpt-4o-mini' });

    expect(resultado).toContain('Transporte');
    expect(buscarCategoriaCache(db, 'uber')).toMatchObject({
      categoria: 'Transporte',
      origem: 'ia',
      modeloSugeriu: 'openai/gpt-4o-mini',
    });
  });

  it('descrição já cacheada: usa a categoria cacheada mesmo que a IA mande uma diferente, sem sobrescrever o cache', async () => {
    const toolInicial = criarToolRegistrarTransacao(db);
    const argsIniciais = toolInicial.schema.parse({
      conta_id: contaId,
      tipo: 'despesa',
      valor: 30,
      categoria: 'Transporte',
      descricao: 'Uber',
      data: '2026-08-31',
    });
    await toolInicial.handler(argsIniciais, { chatId: 1, modelo: 'openai/gpt-4o-mini' });

    const tool = criarToolRegistrarTransacao(db);
    const args = tool.schema.parse({
      conta_id: contaId,
      tipo: 'despesa',
      valor: 25,
      categoria: 'Lazer',
      descricao: 'uber',
      data: '2026-09-01',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Transporte');
    expect(resultado).not.toContain('Lazer');
    expect(buscarCategoriaCache(db, 'uber')).toMatchObject({ categoria: 'Transporte', origem: 'ia' });
  });

  it('sem descrição informada, comportamento igual a hoje: usa a categoria da IA sem tocar o cache', async () => {
    const tool = criarToolRegistrarTransacao(db);
    const args = tool.schema.parse({
      conta_id: contaId,
      tipo: 'despesa',
      valor: 10,
      categoria: 'Alimentação',
      data: '2026-08-31',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Alimentação');
  });

  it('com descrição nova mas sem categoria e sem cache, pede a categoria sem criar a transação', async () => {
    const tool = criarToolRegistrarTransacao(db);
    const args = tool.schema.parse({
      conta_id: contaId,
      tipo: 'despesa',
      valor: 10,
      descricao: 'Farmácia',
      data: '2026-08-31',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('categoria');
  });

  it('sem descrição e sem categoria, pede a categoria', async () => {
    const tool = criarToolRegistrarTransacao(db);
    const args = tool.schema.parse({
      conta_id: contaId,
      tipo: 'despesa',
      valor: 10,
      data: '2026-08-31',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('categoria');
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

  it('editar a categoria de uma transação com descrição sobrescreve o cache com origem usuario', async () => {
    const transacao = criarTransacao(db, {
      contaId,
      tipo: 'despesa',
      valor: 30,
      categoria: 'Transporte',
      descricao: 'Uber',
      data: '2026-08-31',
    });

    const tool = criarToolEditarTransacao(db);
    const args = tool.schema.parse({ id: transacao.id, categoria: 'Deslocamento trabalho' });
    await tool.handler(args, { chatId: 1 });

    expect(buscarCategoriaCache(db, 'uber')).toMatchObject({
      categoria: 'Deslocamento trabalho',
      origem: 'usuario',
      modeloSugeriu: null,
    });
  });

  it('editar outro campo sem tocar categoria não altera o cache', async () => {
    const transacao = criarTransacao(db, {
      contaId,
      tipo: 'despesa',
      valor: 30,
      categoria: 'Transporte',
      descricao: 'Uber',
      data: '2026-08-31',
    });

    const tool = criarToolEditarTransacao(db);
    const args = tool.schema.parse({ id: transacao.id, valor: 40 });
    await tool.handler(args, { chatId: 1 });

    expect(buscarCategoriaCache(db, 'uber')).toBeUndefined();
  });

  it('editar categoria de transação sem descrição não lança erro nem grava no cache', async () => {
    const transacao = criarTransacao(db, {
      contaId,
      tipo: 'despesa',
      valor: 30,
      categoria: 'Transporte',
      data: '2026-08-31',
    });

    const tool = criarToolEditarTransacao(db);
    const args = tool.schema.parse({ id: transacao.id, categoria: 'Deslocamento trabalho' });
    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Deslocamento trabalho');
  });

  it('ciclo completo: registrar, corrigir a categoria e registrar de novo a mesma descrição usa a corrigida', async () => {
    const toolRegistrar = criarToolRegistrarTransacao(db);
    const argsRegistrar = toolRegistrar.schema.parse({
      conta_id: contaId,
      tipo: 'despesa',
      valor: 30,
      categoria: 'Transporte',
      descricao: 'Uber',
      data: '2026-08-31',
    });
    await toolRegistrar.handler(argsRegistrar, { chatId: 7, modelo: 'openai/gpt-4o-mini' });

    const toolEditar = criarToolEditarTransacao(db);
    const argsEditar = toolEditar.schema.parse({ categoria: 'Deslocamento trabalho' });
    await toolEditar.handler(argsEditar, { chatId: 7 });

    const argsRegistrarDeNovo = toolRegistrar.schema.parse({
      conta_id: contaId,
      tipo: 'despesa',
      valor: 22,
      categoria: 'Transporte',
      descricao: 'Uber',
      data: '2026-09-05',
    });
    const resultado = await toolRegistrar.handler(argsRegistrarDeNovo, { chatId: 7 });

    expect(resultado).toContain('Deslocamento trabalho');
    expect(resultado).not.toContain('Transporte');
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

describe('registrar_transacao — alerta de limite de cartão (Fase 6, Tarefa 67)', () => {
  it('não avisa quando o gasto do ciclo fica abaixo do limiar', async () => {
    const cartaoId = criarCartao(db, { contaId, nome: 'Cartão', limite: 1000, diaFechamento: 28, diaVencimento: 5 }).id;
    const tool = criarToolRegistrarTransacao(db);
    const args = tool.schema.parse({
      cartao_id: cartaoId,
      tipo: 'despesa',
      valor: 100,
      categoria: 'Compras',
      data: new Date().toISOString().slice(0, 10),
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).not.toContain('Atenção');
  });

  it('avisa quando o gasto do ciclo atinge 80% ou mais do limite', async () => {
    const cartaoId = criarCartao(db, { contaId, nome: 'Cartão', limite: 1000, diaFechamento: 28, diaVencimento: 5 }).id;
    const hojeISO = new Date().toISOString().slice(0, 10);
    criarTransacao(db, { cartaoId, tipo: 'despesa', valor: 700, categoria: 'Compras', data: hojeISO });

    const tool = criarToolRegistrarTransacao(db);
    const args = tool.schema.parse({
      cartao_id: cartaoId,
      tipo: 'despesa',
      valor: 100,
      categoria: 'Compras',
      data: hojeISO,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Atenção');
    expect(resultado).toContain('800.00');
    expect(resultado).toContain('1000.00');
  });

  it('receita em cartão nunca aciona o cálculo do alerta', async () => {
    const cartaoId = criarCartao(db, { contaId, nome: 'Cartão', limite: 100, diaFechamento: 28, diaVencimento: 5 }).id;
    const tool = criarToolRegistrarTransacao(db);
    const args = tool.schema.parse({
      cartao_id: cartaoId,
      tipo: 'receita',
      valor: 500,
      categoria: 'Reembolso',
      data: new Date().toISOString().slice(0, 10),
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).not.toContain('Atenção');
  });

  it('transação em conta (sem cartão) nunca aciona o cálculo do alerta', async () => {
    const tool = criarToolRegistrarTransacao(db);
    const args = tool.schema.parse({
      conta_id: contaId,
      tipo: 'despesa',
      valor: 100,
      categoria: 'Compras',
      data: new Date().toISOString().slice(0, 10),
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).not.toContain('Atenção');
  });
});
