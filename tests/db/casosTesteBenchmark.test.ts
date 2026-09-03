import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { criarCasoTeste, listarCasosTeste } from '../../src/db/repositories/casosTesteBenchmark.js';

const CHAVE_TESTE = 'chave-teste-casos-teste-benchmark';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-casos-teste-benchmark-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('criarCasoTeste / listarCasosTeste', () => {
  it('retorna array vazio quando não há nenhum caso cadastrado', () => {
    expect(listarCasosTeste(db, 'conversa_texto')).toEqual([]);
  });

  it('cria e lista um caso de teste, serializando/deserializando saida_esperada como JSON', () => {
    criarCasoTeste(db, {
      fluxo: 'conversa_texto',
      entrada: 'registra 30 reais de uber em transporte',
      saidaEsperada: [
        { nome: 'registrar_transacao', argumentos: { valor: 30, categoria: 'transporte', tipo: 'despesa' } },
      ],
      origem: 'derivado_correcao',
    });

    const casos = listarCasosTeste(db, 'conversa_texto');

    expect(casos).toEqual([
      {
        id: expect.any(Number),
        fluxo: 'conversa_texto',
        entrada: 'registra 30 reais de uber em transporte',
        saidaEsperada: [
          { nome: 'registrar_transacao', argumentos: { valor: 30, categoria: 'transporte', tipo: 'despesa' } },
        ],
        origem: 'derivado_correcao',
        criadoEm: expect.any(String),
      },
    ]);
  });

  it('não mistura casos de fluxos diferentes', () => {
    criarCasoTeste(db, {
      fluxo: 'conversa_texto',
      entrada: 'entrada a',
      saidaEsperada: [{ nome: 'ferramenta_a', argumentos: {} }],
      origem: 'curado',
    });
    criarCasoTeste(db, {
      fluxo: 'outro_fluxo',
      entrada: 'entrada b',
      saidaEsperada: [{ nome: 'ferramenta_b', argumentos: {} }],
      origem: 'curado',
    });

    expect(listarCasosTeste(db, 'conversa_texto')).toHaveLength(1);
    expect(listarCasosTeste(db, 'outro_fluxo')).toHaveLength(1);
  });
});
