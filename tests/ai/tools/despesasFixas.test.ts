import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarToolCriarDespesaFixa, criarToolEditarDespesaFixa } from '../../../src/ai/tools/despesasFixas.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { migrate } from '../../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-tools-despesas-fixas';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tools-despesas-fixas-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Conta principal' });
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('tool criar_despesa_fixa', () => {
  it('não exige confirmação (baixo impacto)', () => {
    const tool = criarToolCriarDespesaFixa(db);
    expect(tool.requerConfirmacao).toBeUndefined();
  });

  it('rejeita quando nem conta_id nem conta_apelido são informados', () => {
    const tool = criarToolCriarDespesaFixa(db);
    const validacao = tool.schema.safeParse({
      descricao: 'Aluguel',
      categoria: 'Moradia',
      valor_esperado: 1500,
      dia_vencimento_esperado: 5,
    });
    expect(validacao.success).toBe(false);
  });

  it('resolve conta por apelido e ecoa os dados gravados', async () => {
    const tool = criarToolCriarDespesaFixa(db);
    const args = tool.schema.parse({
      conta_apelido: 'Conta principal',
      descricao: 'Aluguel',
      categoria: 'Moradia',
      valor_esperado: 1500,
      dia_vencimento_esperado: 5,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Aluguel');
    expect(resultado).toContain('Moradia');
    expect(resultado).toContain('1500.00');
    expect(resultado).toContain('5');
    expect(resultado).not.toMatch(/\bid\b/i);
  });

  it('avisa quando a conta não existe', async () => {
    const tool = criarToolCriarDespesaFixa(db);
    const args = tool.schema.parse({
      conta_apelido: 'Inexistente',
      descricao: 'Aluguel',
      categoria: 'Moradia',
      valor_esperado: 1500,
      dia_vencimento_esperado: 5,
    });

    const resultado = await tool.handler(args, { chatId: 1 });
    expect(resultado).toContain('Não encontrei');
  });
});

describe('tool editar_despesa_fixa', () => {
  async function cadastrarDespesa() {
    const toolCriar = criarToolCriarDespesaFixa(db);
    const args = toolCriar.schema.parse({
      conta_apelido: 'Conta principal',
      descricao: 'Aluguel',
      categoria: 'Moradia',
      valor_esperado: 1500,
      dia_vencimento_esperado: 5,
    });
    await toolCriar.handler(args, { chatId: 1 });
  }

  it('rejeita quando nenhum campo de alteração é informado', () => {
    const tool = criarToolEditarDespesaFixa(db);
    const validacao = tool.schema.safeParse({
      conta_apelido: 'Conta principal',
      descricao: 'Aluguel',
    });
    expect(validacao.success).toBe(false);
  });

  it('atualiza valor esperado por conta + descrição, sem precisar de id', async () => {
    await cadastrarDespesa();
    const tool = criarToolEditarDespesaFixa(db);
    const args = tool.schema.parse({
      conta_apelido: 'Conta principal',
      descricao: 'Aluguel',
      valor_esperado: 1600,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('1600.00');
    expect(resultado).not.toMatch(/\bid\b/i);
  });

  it('pausa e reativa via status', async () => {
    await cadastrarDespesa();
    const tool = criarToolEditarDespesaFixa(db);

    const pausar = tool.schema.parse({
      conta_apelido: 'Conta principal',
      descricao: 'Aluguel',
      status: 'pausada',
    });
    const resultadoPausar = await tool.handler(pausar, { chatId: 1 });
    expect(resultadoPausar).toContain('pausada');

    const reativar = tool.schema.parse({
      conta_apelido: 'Conta principal',
      descricao: 'Aluguel',
      status: 'ativa',
    });
    const resultadoReativar = await tool.handler(reativar, { chatId: 1 });
    expect(resultadoReativar).toContain('ativa');
  });

  it('resolve descrição por substring, sem exigir nome exato', async () => {
    await cadastrarDespesa();
    const tool = criarToolEditarDespesaFixa(db);
    const args = tool.schema.parse({
      conta_apelido: 'Conta principal',
      descricao: 'aluguel',
      dia_vencimento_esperado: 10,
    });

    const resultado = await tool.handler(args, { chatId: 1 });
    expect(resultado).toContain('dia 10');
  });

  it('avisa quando não encontra despesa fixa com a descrição informada', async () => {
    await cadastrarDespesa();
    const tool = criarToolEditarDespesaFixa(db);
    const args = tool.schema.parse({
      conta_apelido: 'Conta principal',
      descricao: 'Academia',
      valor_esperado: 100,
    });

    const resultado = await tool.handler(args, { chatId: 1 });
    expect(resultado).toContain('Não encontrei');
  });
});
