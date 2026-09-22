import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { criarTransacao } from '../../src/db/repositories/transacoes.js';
import { montarImagemRelatorioSemanal } from '../../src/relatorios/imagemSemanal.js';

const CHAVE_TESTE = 'chave-teste-imagem-semanal';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-imagem-semanal-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Corrente' }).id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('montarImagemRelatorioSemanal', () => {
  it('com transações no período, gera um PNG válido com o gráfico embutido (imagem mais alta)', async () => {
    const agora = new Date(2026, 8, 24); // quinta-feira, 24/09/2026
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 100, categoria: 'Mercado', data: '2026-09-22' });
    criarTransacao(db, { contaId, tipo: 'receita', valor: 1000, categoria: 'Salário', data: '2026-09-21' });

    const buffer = await montarImagemRelatorioSemanal(db, agora);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 4)).toEqual(PNG_MAGIC);
  });

  it('sem nenhuma despesa no período, ainda gera um PNG válido (sem o gráfico)', async () => {
    const agora = new Date(2026, 8, 24);
    criarTransacao(db, { contaId, tipo: 'receita', valor: 1000, categoria: 'Salário', data: '2026-09-21' });

    const buffer = await montarImagemRelatorioSemanal(db, agora);

    expect(buffer.subarray(0, 4)).toEqual(PNG_MAGIC);
  });

  it('sem nenhuma transação no período, não lança exceção', async () => {
    const agora = new Date(2026, 8, 24);

    await expect(montarImagemRelatorioSemanal(db, agora)).resolves.toBeInstanceOf(Buffer);
  });

  it('valor grande (R$ 999.999,99) não lança exceção nem quebra a geração', async () => {
    const agora = new Date(2026, 8, 24);
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 999999.99, categoria: 'Imóvel', data: '2026-09-22' });

    const buffer = await montarImagemRelatorioSemanal(db, agora);

    expect(buffer.subarray(0, 4)).toEqual(PNG_MAGIC);
  });
});
