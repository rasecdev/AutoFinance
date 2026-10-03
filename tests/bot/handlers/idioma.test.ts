import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../../../src/db/client.js';
import { migrate } from '../../../src/db/migrate.js';
import { obterIdioma } from '../../../src/db/repositories/idiomaBot.js';
import { createHandlerIdioma } from '../../../src/bot/handlers/idioma.js';

const CHAVE_TESTE = 'chave-teste-handler-idioma';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-handler-idioma-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function criarContextoFake(texto: string) {
  return {
    message: { text: texto },
    reply: vi.fn(),
    api: { setMyCommands: vi.fn() },
  } as unknown as Context & { reply: ReturnType<typeof vi.fn>; api: { setMyCommands: ReturnType<typeof vi.fn> } };
}

describe('handlerIdioma', () => {
  it('/idioma en grava o idioma e confirma em inglês', async () => {
    const handler = createHandlerIdioma(db);
    const ctx = criarContextoFake('/idioma en');

    await handler(ctx);

    expect(obterIdioma(db)).toBe('en');
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Language changed'));
  });

  it('/idioma en re-chama setMyCommands pra atualizar o menu "/"', async () => {
    const handler = createHandlerIdioma(db);
    const ctx = criarContextoFake('/idioma en');

    await handler(ctx);

    expect(ctx.api.setMyCommands).toHaveBeenCalledTimes(1);
  });

  it('/idioma fr (não suportado) não grava nada e responde erro no idioma atual', async () => {
    const handler = createHandlerIdioma(db);
    const ctx = criarContextoFake('/idioma fr');

    await handler(ctx);

    expect(obterIdioma(db)).toBe('pt');
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Idioma inválido'));
  });

  it('/idioma sem argumento mostra o idioma ativo, sem gravar nada', async () => {
    const handler = createHandlerIdioma(db);
    const ctx = criarContextoFake('/idioma');

    await handler(ctx);

    expect(obterIdioma(db)).toBe('pt');
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Idioma ativo'));
  });
});
