import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { listarUsoTokensPeriodo, registrarUsoTokens } from '../../src/db/repositories/usoTokens.js';

const CHAVE_TESTE = 'chave-teste-uso-tokens';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-uso-tokens-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('registrarUsoTokens', () => {
  it('grava uma linha com os campos esperados', () => {
    registrarUsoTokens(db, {
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      tokensPrompt: 42,
      tokensCompletion: 13,
      custoEstimado: 0,
      origem: 'uso_real',
    });

    const linhas = db.prepare('SELECT * FROM uso_tokens').all() as Array<Record<string, unknown>>;

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      tokens_prompt: 42,
      tokens_completion: 13,
      custo_estimado: 0,
      origem: 'uso_real',
    });
  });
});

describe('listarUsoTokensPeriodo', () => {
  it('retorna registros dentro da janela e ignora fora dela', () => {
    registrarUsoTokens(db, {
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      tokensPrompt: 10,
      tokensCompletion: 5,
      custoEstimado: 0.001,
      origem: 'uso_real',
    });

    const agora = new Date();
    const umaHoraAntes = new Date(agora.getTime() - 3600_000).toISOString();
    const umaHoraDepois = new Date(agora.getTime() + 3600_000).toISOString();
    const duasHorasAntes = new Date(agora.getTime() - 7200_000).toISOString();

    expect(listarUsoTokensPeriodo(db, { inicio: umaHoraAntes, fim: umaHoraDepois })).toHaveLength(1);
    expect(listarUsoTokensPeriodo(db, { inicio: duasHorasAntes, fim: umaHoraAntes })).toHaveLength(0);
  });

  it('retorna array vazio quando não há registro', () => {
    expect(listarUsoTokensPeriodo(db, { inicio: '2000-01-01T00:00:00.000Z', fim: '2099-01-01T00:00:00.000Z' })).toEqual(
      [],
    );
  });
});
