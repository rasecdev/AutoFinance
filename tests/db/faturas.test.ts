import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { criarCartao } from '../../src/db/repositories/cartoes.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { buscarFaturaPorCartaoEMes, marcarFaturaRenegociada, obterFatura } from '../../src/db/repositories/faturas.js';
import { migrate } from '../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-faturas';

let dir: string;
let db: DbClient;
let cartaoId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-faturas-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  const contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' }).id;
  cartaoId = criarCartao(db, { contaId, nome: 'Nubank Cartão', limite: 5000, diaFechamento: 5, diaVencimento: 10 }).id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function inserirFatura(mesReferencia: string, valor = 1000): number {
  const resultado = db
    .prepare("INSERT INTO faturas (cartao_id, mes_referencia, valor, status) VALUES (?, ?, ?, 'aberta')")
    .run(cartaoId, mesReferencia, valor);
  return Number(resultado.lastInsertRowid);
}

describe('obterFatura', () => {
  it('retorna a fatura já com o conta_id resolvido via cartão', () => {
    const faturaId = inserirFatura('2026-08', 1500);

    const fatura = obterFatura(db, faturaId);

    expect(fatura?.valor).toBe(1500);
    expect(fatura?.mesReferencia).toBe('2026-08');
    expect(fatura?.contaId).toBeGreaterThan(0);
  });

  it('retorna undefined quando a fatura não existe', () => {
    expect(obterFatura(db, 999)).toBeUndefined();
  });
});

describe('buscarFaturaPorCartaoEMes', () => {
  it('encontra a fatura pelo par cartão + mês de referência', () => {
    const faturaId = inserirFatura('2026-08');

    const fatura = buscarFaturaPorCartaoEMes(db, cartaoId, '2026-08');

    expect(fatura?.id).toBe(faturaId);
  });

  it('retorna undefined quando não há fatura desse cartão nesse mês', () => {
    inserirFatura('2026-08');

    expect(buscarFaturaPorCartaoEMes(db, cartaoId, '2026-09')).toBeUndefined();
  });
});

describe('marcarFaturaRenegociada', () => {
  it('atualiza o status da fatura para renegociada', () => {
    const faturaId = inserirFatura('2026-08');

    marcarFaturaRenegociada(db, faturaId);

    expect(obterFatura(db, faturaId)?.status).toBe('renegociada');
  });
});
