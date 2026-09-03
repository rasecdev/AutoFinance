import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import {
  criarModeloReferencia,
  listarModelosReferenciaAtivos,
} from '../../src/db/repositories/modelosReferenciaComparacao.js';

const CHAVE_TESTE = 'chave-teste-modelos-referencia-comparacao';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-modelos-referencia-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('criarModeloReferencia / listarModelosReferenciaAtivos', () => {
  it('retorna array vazio quando não há nenhum modelo cadastrado', () => {
    expect(listarModelosReferenciaAtivos(db)).toEqual([]);
  });

  it('cria e lista um modelo de referência, ativo por padrão', () => {
    criarModeloReferencia(db, 'GPT-4o', 'openai/gpt-4o');

    const modelos = listarModelosReferenciaAtivos(db);

    expect(modelos).toEqual([
      { id: expect.any(Number), nomeExibicao: 'GPT-4o', modelIdOpenrouter: 'openai/gpt-4o', ativo: true },
    ]);
  });

  it('não lista modelo inativo', () => {
    const modelo = criarModeloReferencia(db, 'GPT-4o', 'openai/gpt-4o');
    db.prepare('UPDATE modelos_referencia_comparacao SET ativo = 0 WHERE id = ?').run(modelo.id);

    expect(listarModelosReferenciaAtivos(db)).toEqual([]);
  });
});
