import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import {
  calcularCustoTokens,
  obterUltimoSnapshotPorModelo,
  obterUltimosSnapshots,
  registrarSnapshotCatalogo,
  registrarSnapshotModelo,
} from '../../src/db/repositories/modelosOpenrouterHistorico.js';

const CHAVE_TESTE = 'chave-teste-modelos-openrouter-historico';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-modelos-openrouter-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('registrarSnapshotModelo / obterUltimosSnapshots', () => {
  it('grava um snapshot e recupera pelo nome do modelo', () => {
    registrarSnapshotModelo(db, {
      modelo: 'openai/gpt-4o-mini',
      precoPrompt: 0.00000015,
      precoCompletion: 0.0000006,
      capacidades: ['tools', 'temperature'],
    });

    const snapshots = obterUltimosSnapshots(db, 'openai/gpt-4o-mini', 10);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      modelo: 'openai/gpt-4o-mini',
      precoPrompt: 0.00000015,
      precoCompletion: 0.0000006,
      capacidades: ['tools', 'temperature'],
    });
  });

  it('grava capacidades ausentes como null', () => {
    registrarSnapshotModelo(db, {
      modelo: 'openai/gpt-4o-mini',
      precoPrompt: 0.00000015,
      precoCompletion: 0.0000006,
    });

    expect(obterUltimosSnapshots(db, 'openai/gpt-4o-mini', 1)[0]?.capacidades).toBeNull();
  });

  it('retorna os últimos N snapshots do modelo, mais recente primeiro', () => {
    registrarSnapshotModelo(db, { modelo: 'openai/gpt-4o-mini', precoPrompt: 1, precoCompletion: 1 });
    registrarSnapshotModelo(db, { modelo: 'openai/gpt-4o-mini', precoPrompt: 2, precoCompletion: 2 });
    registrarSnapshotModelo(db, { modelo: 'openai/gpt-4o-mini', precoPrompt: 3, precoCompletion: 3 });

    const snapshots = obterUltimosSnapshots(db, 'openai/gpt-4o-mini', 2);

    expect(snapshots.map((s) => s.precoPrompt)).toEqual([3, 2]);
  });

  it('não mistura snapshots de modelos diferentes', () => {
    registrarSnapshotModelo(db, { modelo: 'openai/gpt-4o-mini', precoPrompt: 1, precoCompletion: 1 });
    registrarSnapshotModelo(db, { modelo: 'qwen/qwen3-32b', precoPrompt: 2, precoCompletion: 2 });

    expect(obterUltimosSnapshots(db, 'openai/gpt-4o-mini', 10)).toHaveLength(1);
    expect(obterUltimosSnapshots(db, 'qwen/qwen3-32b', 10)).toHaveLength(1);
  });
});

describe('registrarSnapshotCatalogo', () => {
  it('grava vários snapshots numa única transação', () => {
    registrarSnapshotCatalogo(db, [
      { modelo: 'openai/gpt-4o-mini', precoPrompt: 1, precoCompletion: 1 },
      { modelo: 'qwen/qwen3-32b', precoPrompt: 2, precoCompletion: 2 },
    ]);

    const linhas = db.prepare('SELECT * FROM modelos_openrouter_historico').all();
    expect(linhas).toHaveLength(2);
  });
});

describe('obterUltimoSnapshotPorModelo', () => {
  it('retorna só o snapshot mais recente de cada modelo distinto', () => {
    registrarSnapshotModelo(db, { modelo: 'openai/gpt-4o-mini', precoPrompt: 1, precoCompletion: 1 });
    registrarSnapshotModelo(db, { modelo: 'openai/gpt-4o-mini', precoPrompt: 2, precoCompletion: 2 });
    registrarSnapshotModelo(db, { modelo: 'qwen/qwen3-32b', precoPrompt: 3, precoCompletion: 3 });

    const ultimos = obterUltimoSnapshotPorModelo(db);

    expect(ultimos).toHaveLength(2);
    expect(ultimos.find((s) => s.modelo === 'openai/gpt-4o-mini')?.precoPrompt).toBe(2);
    expect(ultimos.find((s) => s.modelo === 'qwen/qwen3-32b')?.precoPrompt).toBe(3);
  });

  it('retorna array vazio quando não há nenhum snapshot', () => {
    expect(obterUltimoSnapshotPorModelo(db)).toEqual([]);
  });
});

describe('calcularCustoTokens', () => {
  it('calcula o custo usando o snapshot de preço mais recente do modelo', () => {
    registrarSnapshotModelo(db, { modelo: 'openai/gpt-4o-mini', precoPrompt: 0.001, precoCompletion: 0.002 });
    registrarSnapshotModelo(db, { modelo: 'openai/gpt-4o-mini', precoPrompt: 0.01, precoCompletion: 0.02 });

    const custo = calcularCustoTokens(db, 'openai/gpt-4o-mini', 100, 50);

    expect(custo).toBeCloseTo(100 * 0.01 + 50 * 0.02);
  });

  it('retorna 0 quando não há snapshot pro modelo (degradação graciosa)', () => {
    expect(calcularCustoTokens(db, 'modelo/inexistente', 100, 50)).toBe(0);
  });
});
