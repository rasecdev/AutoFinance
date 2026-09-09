import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { buscarCategoriaCache, upsertCategoriaCache } from '../../src/db/repositories/cacheCategorizacao.js';

const CHAVE_TESTE = 'chave-teste-cache-categorizacao';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-cache-categorizacao-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('buscarCategoriaCache', () => {
  it('retorna undefined quando não há linha pra descrição normalizada', () => {
    expect(buscarCategoriaCache(db, 'uber')).toBeUndefined();
  });

  it('retorna a linha gravada', () => {
    upsertCategoriaCache(db, {
      descricaoNormalizada: 'uber',
      categoria: 'Transporte',
      origem: 'ia',
      modeloSugeriu: 'openai/gpt-4o-mini',
    });

    expect(buscarCategoriaCache(db, 'uber')).toEqual({
      id: expect.any(Number),
      descricaoNormalizada: 'uber',
      categoria: 'Transporte',
      origem: 'ia',
      modeloSugeriu: 'openai/gpt-4o-mini',
      atualizadoEm: expect.any(String),
    });
  });
});

describe('upsertCategoriaCache', () => {
  it('cria a linha na primeira vez', () => {
    upsertCategoriaCache(db, { descricaoNormalizada: 'uber', categoria: 'Transporte', origem: 'ia' });

    const linhas = db.prepare('SELECT * FROM cache_categorizacao').all();
    expect(linhas).toHaveLength(1);
  });

  it('sobrescreve categoria/origem/modelo_sugeriu quando já existe linha (ON CONFLICT)', () => {
    upsertCategoriaCache(db, {
      descricaoNormalizada: 'uber',
      categoria: 'Transporte',
      origem: 'ia',
      modeloSugeriu: 'openai/gpt-4o-mini',
    });

    upsertCategoriaCache(db, {
      descricaoNormalizada: 'uber',
      categoria: 'Deslocamento trabalho',
      origem: 'usuario',
    });

    const linhas = db.prepare('SELECT * FROM cache_categorizacao').all();
    expect(linhas).toHaveLength(1);
    expect(buscarCategoriaCache(db, 'uber')).toMatchObject({
      categoria: 'Deslocamento trabalho',
      origem: 'usuario',
      modeloSugeriu: null,
    });
  });

  it('isola descrições diferentes', () => {
    upsertCategoriaCache(db, { descricaoNormalizada: 'uber', categoria: 'Transporte', origem: 'ia' });
    upsertCategoriaCache(db, { descricaoNormalizada: 'ifood', categoria: 'Alimentação', origem: 'ia' });

    expect(buscarCategoriaCache(db, 'uber')?.categoria).toBe('Transporte');
    expect(buscarCategoriaCache(db, 'ifood')?.categoria).toBe('Alimentação');
  });
});
