import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { criarResumoConversa, obterUltimoResumo } from '../../src/db/repositories/resumosConversa.js';

const CHAVE_TESTE = 'chave-teste-resumos-conversa';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-resumos-conversa-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('criarResumoConversa / obterUltimoResumo', () => {
  it('retorna undefined quando o chat nunca teve um resumo', () => {
    expect(obterUltimoResumo(db, 123)).toBeUndefined();
  });

  it('cria um resumo e recupera pelo chat', () => {
    criarResumoConversa(db, {
      chatId: 123,
      resumoTexto: 'usuário perguntou sobre gastos de março',
      cobreAteTraceId: 'trace-10',
      tokensJanelaNoGatilho: 6500,
    });

    const resumo = obterUltimoResumo(db, 123);

    expect(resumo).toMatchObject({
      chatId: 123,
      resumoTexto: 'usuário perguntou sobre gastos de março',
      cobreAteTraceId: 'trace-10',
      tokensJanelaNoGatilho: 6500,
    });
  });

  it('retorna o resumo mais recente quando há mais de um para o mesmo chat', () => {
    criarResumoConversa(db, {
      chatId: 123,
      resumoTexto: 'resumo antigo',
      cobreAteTraceId: 'trace-5',
      tokensJanelaNoGatilho: 6000,
    });
    criarResumoConversa(db, {
      chatId: 123,
      resumoTexto: 'resumo novo',
      cobreAteTraceId: 'trace-15',
      tokensJanelaNoGatilho: 6200,
    });

    expect(obterUltimoResumo(db, 123)?.resumoTexto).toBe('resumo novo');
  });

  it('não mistura resumos de chats diferentes', () => {
    criarResumoConversa(db, {
      chatId: 111,
      resumoTexto: 'resumo do chat 111',
      cobreAteTraceId: 'trace-1',
      tokensJanelaNoGatilho: 6000,
    });
    criarResumoConversa(db, {
      chatId: 222,
      resumoTexto: 'resumo do chat 222',
      cobreAteTraceId: 'trace-2',
      tokensJanelaNoGatilho: 6000,
    });

    expect(obterUltimoResumo(db, 111)?.resumoTexto).toBe('resumo do chat 111');
    expect(obterUltimoResumo(db, 222)?.resumoTexto).toBe('resumo do chat 222');
  });
});
