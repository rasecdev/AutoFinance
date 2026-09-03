import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { listarBenchmarks, registrarBenchmark } from '../../src/db/repositories/benchmarksModelos.js';

const CHAVE_TESTE = 'chave-teste-benchmarks-modelos';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-benchmarks-modelos-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('registrarBenchmark / listarBenchmarks', () => {
  it('retorna array vazio quando não há nenhum benchmark cadastrado', () => {
    expect(listarBenchmarks(db, 'conversa_texto', 'openai/gpt-4o-mini')).toEqual([]);
  });

  it('cria e lista um benchmark, gravando data_pesquisa automaticamente', () => {
    registrarBenchmark(db, {
      fluxo: 'conversa_texto',
      modelIdOpenrouter: 'openai/gpt-4o-mini',
      metrica: 'acuracia_tool_calling',
      valor: 0.9,
      fonteUrl: 'interno',
    });

    const benchmarks = listarBenchmarks(db, 'conversa_texto', 'openai/gpt-4o-mini');

    expect(benchmarks).toEqual([
      {
        id: expect.any(Number),
        fluxo: 'conversa_texto',
        modelIdOpenrouter: 'openai/gpt-4o-mini',
        metrica: 'acuracia_tool_calling',
        valor: 0.9,
        fonteUrl: 'interno',
        dataPesquisa: expect.any(String),
      },
    ]);
  });

  it('mais recente primeiro', () => {
    registrarBenchmark(db, {
      fluxo: 'conversa_texto',
      modelIdOpenrouter: 'openai/gpt-4o-mini',
      metrica: 'acuracia_tool_calling',
      valor: 0.8,
      fonteUrl: 'interno',
    });
    registrarBenchmark(db, {
      fluxo: 'conversa_texto',
      modelIdOpenrouter: 'openai/gpt-4o-mini',
      metrica: 'acuracia_tool_calling',
      valor: 0.95,
      fonteUrl: 'interno',
    });

    const benchmarks = listarBenchmarks(db, 'conversa_texto', 'openai/gpt-4o-mini');

    expect(benchmarks.map((b) => b.valor)).toEqual([0.95, 0.8]);
  });

  it('não mistura benchmark de fluxo/modelo diferente', () => {
    registrarBenchmark(db, {
      fluxo: 'conversa_texto',
      modelIdOpenrouter: 'openai/gpt-4o-mini',
      metrica: 'acuracia_tool_calling',
      valor: 0.9,
      fonteUrl: 'interno',
    });
    registrarBenchmark(db, {
      fluxo: 'conversa_texto',
      modelIdOpenrouter: 'qwen/qwen3-32b',
      metrica: 'acuracia_tool_calling',
      valor: 0.7,
      fonteUrl: 'interno',
    });

    expect(listarBenchmarks(db, 'conversa_texto', 'openai/gpt-4o-mini')).toHaveLength(1);
    expect(listarBenchmarks(db, 'conversa_texto', 'qwen/qwen3-32b')).toHaveLength(1);
  });
});
