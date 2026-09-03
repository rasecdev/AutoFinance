import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { listarCasosTeste } from '../../src/db/repositories/casosTesteBenchmark.js';
import { migrate } from '../../src/db/migrate.js';
import { CASOS_CURADOS, seedCasosTesteBenchmarkCurados } from '../../src/scripts/seedCasosTesteBenchmarkCurados.js';

const CHAVE_TESTE = 'chave-teste-seed-casos-curados';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-seed-casos-curados-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('seedCasosTesteBenchmarkCurados', () => {
  it('cria todos os casos curados numa base vazia', () => {
    const criados = seedCasosTesteBenchmarkCurados(db);

    expect(criados).toBe(CASOS_CURADOS.length);
    const casos = listarCasosTeste(db, 'conversa_texto');
    expect(casos).toHaveLength(CASOS_CURADOS.length);
    expect(casos.every((caso) => caso.origem === 'curado')).toBe(true);
  });

  it('não duplica ao rodar de novo (idempotente por entrada)', () => {
    seedCasosTesteBenchmarkCurados(db);

    const criadosSegundaRodada = seedCasosTesteBenchmarkCurados(db);

    expect(criadosSegundaRodada).toBe(0);
    expect(listarCasosTeste(db, 'conversa_texto')).toHaveLength(CASOS_CURADOS.length);
  });

  it('pula só o caso já existente quando a base já tem uma entrada igual, criando o resto', () => {
    const primeiraEntrada = CASOS_CURADOS[0];
    if (!primeiraEntrada) throw new Error('CASOS_CURADOS vazio');

    db.prepare(
      `INSERT INTO casos_teste_benchmark (fluxo, entrada, saida_esperada, origem, criado_em)
       VALUES ('conversa_texto', ?, '[]', 'derivado_correcao', ?)`,
    ).run(primeiraEntrada.entrada, new Date().toISOString());

    const criados = seedCasosTesteBenchmarkCurados(db);

    expect(criados).toBe(CASOS_CURADOS.length - 1);
    expect(listarCasosTeste(db, 'conversa_texto')).toHaveLength(CASOS_CURADOS.length);
  });
});
