import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import {
  calcularSaldoTransferenciasConta,
  criarTransferencia,
} from '../../src/db/repositories/transferencias.js';

const CHAVE_TESTE = 'chave-teste-transferencias';

let dir: string;
let db: DbClient;
let contaOrigemId: number;
let contaDestinoId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-transferencias-test-'));
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

describe('criarTransferencia', () => {
  it('grava com taxa padrão zero quando omitida', () => {
    const transferencia = criarTransferencia(db, {
      contaOrigemId,
      contaDestinoId,
      valor: 100,
      data: '2026-08-31',
    });

    expect(transferencia.taxa).toBe(0);
  });

  it('grava a taxa informada', () => {
    const transferencia = criarTransferencia(db, {
      contaOrigemId,
      contaDestinoId,
      valor: 100,
      taxa: 5,
      data: '2026-08-31',
    });

    expect(transferencia.taxa).toBe(5);
  });
});

describe('calcularSaldoTransferenciasConta', () => {
  it('debita o valor cheio da origem e credita valor menos taxa no destino', () => {
    criarTransferencia(db, { contaOrigemId, contaDestinoId, valor: 100, taxa: 10, data: '2026-08-31' });

    expect(calcularSaldoTransferenciasConta(db, contaOrigemId)).toBe(-100);
    expect(calcularSaldoTransferenciasConta(db, contaDestinoId)).toBe(90);
  });

  it('sem taxa, é 1:1', () => {
    criarTransferencia(db, { contaOrigemId, contaDestinoId, valor: 100, data: '2026-08-31' });

    expect(calcularSaldoTransferenciasConta(db, contaOrigemId)).toBe(-100);
    expect(calcularSaldoTransferenciasConta(db, contaDestinoId)).toBe(100);
  });

  it('conta sem nenhuma transferência tem delta zero', () => {
    const outraContaId = criarConta(db, { bancoNome: 'Bradesco', tipo: 'PF', apelido: 'Outra' }).id;
    expect(calcularSaldoTransferenciasConta(db, outraContaId)).toBe(0);
  });
});
