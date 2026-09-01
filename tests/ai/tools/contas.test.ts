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

  it('cria a conta e retorna uma mensagem de confirmação, sem expor id interno', async () => {
    const tool = criarToolCriarConta(db);
    const args = tool.schema.parse({ banco: 'Nubank', tipo: 'PF', apelido: 'Conta principal' });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Conta principal');
    expect(resultado).not.toMatch(/\bid\b/i);
  });

  it('recusa apelido já usado por outra conta, sem criar duplicata', async () => {
    const tool = criarToolCriarConta(db);
    const args = tool.schema.parse({ banco: 'Nubank', tipo: 'PF', apelido: 'Principal' });
    await tool.handler(args, { chatId: 1 });

    const resultado = await tool.handler(
      tool.schema.parse({ banco: 'Itaú', tipo: 'PJ', apelido: 'Principal' }),
      { chatId: 1 },
    );

    expect(resultado).toContain('Já existe uma conta');
    const total = (db.prepare('SELECT COUNT(*) as total FROM contas').get() as { total: number }).total;
    expect(total).toBe(1);
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
    expect(resultado).not.toMatch(/\bid\b/i);
  });

  it('recusa nome de cartão já usado na mesma conta, sem criar duplicata', async () => {
    const conta = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Conta principal' });
    const tool = criarToolCriarCartao(db);
    const args = tool.schema.parse({
      conta_id: conta.id,
      nome: 'Roxinho',
      limite: 1000,
      dia_fechamento: 5,
      dia_vencimento: 12,
    });
    await tool.handler(args, { chatId: 1 });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('já tem um cartão chamado');
    const total = (db.prepare('SELECT COUNT(*) as total FROM cartoes').get() as { total: number }).total;
    expect(total).toBe(1);
  });

  it('rejeita quando nem conta_id nem conta_apelido são informados', () => {
    const tool = criarToolCriarCartao(db);
    const validacao = tool.schema.safeParse({
      nome: 'Cartão',
      limite: 1000,
      dia_fechamento: 5,
      dia_vencimento: 12,
    });
    expect(validacao.success).toBe(false);
  });

  it('cria o cartão resolvendo a conta pelo apelido', async () => {
    criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' });
    const tool = criarToolCriarCartao(db);
    const args = tool.schema.parse({
      conta_apelido: 'principal',
      nome: 'Nubank Roxinho',
      limite: 5000,
      dia_fechamento: 10,
      dia_vencimento: 17,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Nubank Roxinho');
  });

  it('avisa quando o apelido da conta não é encontrado', async () => {
    const tool = criarToolCriarCartao(db);
    const args = tool.schema.parse({
      conta_apelido: 'Inexistente',
      nome: 'Cartão',
      limite: 1000,
      dia_fechamento: 5,
      dia_vencimento: 12,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não encontrei');
  });

  it('quando não encontra a conta, sugere as contas que já existem (pra ajudar a IA a se corrigir)', async () => {
    criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Reserva' });
    const tool = criarToolCriarCartao(db);
    const args = tool.schema.parse({
      conta_apelido: 'Inexistente',
      nome: 'Cartão',
      limite: 1000,
      dia_fechamento: 5,
      dia_vencimento: 12,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Contas existentes');
    expect(resultado).toContain('Reserva');
  });

  it('quando não há nenhuma conta cadastrada, avisa isso em vez de listar vazio', async () => {
    const tool = criarToolCriarCartao(db);
    const args = tool.schema.parse({
      conta_apelido: 'Inexistente',
      nome: 'Cartão',
      limite: 1000,
      dia_fechamento: 5,
      dia_vencimento: 12,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('não tem nenhuma conta cadastrada');
  });

  it('avisa e lista as opções quando o apelido da conta é ambíguo', async () => {
    // idx_contas_apelido_unico é case-sensitive; "Principal" e "principal" não colidem no
    // banco, mas colidem na resolução por apelido (case-insensitive) — cenário real pra dado
    // que não passou pela checagem da tool criar_conta (que já bloqueia duplicata antes).
    criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' });
    criarConta(db, { bancoNome: 'Itaú', tipo: 'PJ', apelido: 'principal' });
    const tool = criarToolCriarCartao(db);
    const args = tool.schema.parse({
      conta_apelido: 'Principal',
      nome: 'Cartão',
      limite: 1000,
      dia_fechamento: 5,
      dia_vencimento: 12,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('mais de uma conta');
    expect(resultado).toContain('PF no Nubank');
    expect(resultado).toContain('PJ no Itaú');
    expect(resultado).not.toMatch(/\bid\b/i);
  });
});
