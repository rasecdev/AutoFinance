import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarToolRegistrarTransferencia } from '../../../src/ai/tools/transferencias.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { migrate } from '../../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-tools-transferencias';

let dir: string;
let db: DbClient;
let contaOrigemId: number;
let contaDestinoId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tools-transferencias-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaOrigemId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Origem' }).id;
  contaDestinoId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Destino' }).id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('tool registrar_transferencia', () => {
  it('não exige confirmação (baixo impacto)', () => {
    const tool = criarToolRegistrarTransferencia(db);
    expect(tool.requerConfirmacao).toBeUndefined();
  });

  it('grava e ecoa o valor recebido igual ao enviado quando não há taxa', async () => {
    const tool = criarToolRegistrarTransferencia(db);
    const args = tool.schema.parse({
      conta_origem_id: contaOrigemId,
      conta_destino_id: contaDestinoId,
      valor: 100,
      data: '2026-08-31',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('R$ 100.00 enviados');
    expect(resultado).toContain('R$ 100.00 recebidos');
    expect(resultado).not.toMatch(/\bid\b/i);
  });

  it('com taxa, o destino recebe valor menos taxa', async () => {
    const tool = criarToolRegistrarTransferencia(db);
    const args = tool.schema.parse({
      conta_origem_id: contaOrigemId,
      conta_destino_id: contaDestinoId,
      valor: 100,
      taxa: 8,
      data: '2026-08-31',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('R$ 100.00 enviados');
    expect(resultado).toContain('R$ 92.00 recebidos');
    expect(resultado).toContain('taxa R$ 8.00');
  });

  it('resolve origem e destino pelo apelido', async () => {
    const tool = criarToolRegistrarTransferencia(db);
    const args = tool.schema.parse({
      conta_origem_apelido: 'Origem',
      conta_destino_apelido: 'Destino',
      valor: 50,
      data: '2026-08-31',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('R$ 50.00 enviados');
  });

  it('recusa transferência da conta para ela mesma', async () => {
    const tool = criarToolRegistrarTransferencia(db);
    const args = tool.schema.parse({
      conta_origem_id: contaOrigemId,
      conta_destino_id: contaOrigemId,
      valor: 50,
      data: '2026-08-31',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('não podem ser a mesma');
  });

  it('sem data informada, usa a data de hoje', async () => {
    const tool = criarToolRegistrarTransferencia(db);
    const args = tool.schema.parse({
      conta_origem_id: contaOrigemId,
      conta_destino_id: contaDestinoId,
      valor: 50,
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    const hoje = new Date();
    const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    expect(resultado).toContain(hojeISO);
  });

  it('avisa quando a conta de origem não é encontrada', async () => {
    const tool = criarToolRegistrarTransferencia(db);
    const args = tool.schema.parse({
      conta_origem_apelido: 'Inexistente',
      conta_destino_id: contaDestinoId,
      valor: 50,
      data: '2026-08-31',
    });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Não encontrei');
  });
});
