import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarToolCriarCartao, criarToolCriarConta } from '../../../src/ai/tools/contas.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { migrate } from '../../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-tools-contas';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tools-contas-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('tool criar_conta', () => {
  it('é marcada como alto impacto (requerConfirmacao)', () => {
    const tool = criarToolCriarConta(db);
    expect(tool.requerConfirmacao).toBe(true);
  });

  it('rejeita tipo fora de PF/PJ', () => {
    const tool = criarToolCriarConta(db);
    const validacao = tool.schema.safeParse({ banco: 'Nubank', tipo: 'CNPJ', apelido: 'x' });
    expect(validacao.success).toBe(false);
  });

  it('cria a conta e retorna uma mensagem de confirmação com o id', async () => {
    const tool = criarToolCriarConta(db);
    const args = tool.schema.parse({ banco: 'Nubank', tipo: 'PF', apelido: 'Conta principal' });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Conta principal');
    expect(resultado).toMatch(/ID da conta: \d+/);
  });
});

describe('tool criar_cartao', () => {
  it('é marcada como alto impacto (requerConfirmacao)', () => {
    const tool = criarToolCriarCartao(db);
    expect(tool.requerConfirmacao).toBe(true);
  });

  it('rejeita dia_fechamento fora de 1-31', () => {
    const tool = criarToolCriarCartao(db);
    const validacao = tool.schema.safeParse({
      conta_id: 1,
      nome: 'Cartão',
      limite: 1000,
      dia_fechamento: 40,
      dia_vencimento: 10,
    });
    expect(validacao.success).toBe(false);
  });

  it('avisa quando a conta informada não existe, sem lançar exceção', async () => {
    const tool = criarToolCriarCartao(db);
    const args = tool.schema.parse({
      conta_id: 9999,
      nome: 'Cartão',
      limite: 1000,
      dia_fechamento: 5,
      dia_vencimento: 12,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não encontrei');
  });

  it('cria o cartão quando a conta existe', async () => {
    const conta = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Conta principal' });
    const tool = criarToolCriarCartao(db);
    const args = tool.schema.parse({
      conta_id: conta.id,
      nome: 'Nubank Roxinho',
      limite: 5000,
      dia_fechamento: 10,
      dia_vencimento: 17,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Nubank Roxinho');
    expect(resultado).toMatch(/ID do cartão: \d+/);
  });
});
