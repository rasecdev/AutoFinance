import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandlerModelo } from '../../../src/bot/handlers/modelo.js';
import type { DbClient } from '../../../src/db/client.js';
import { migrate } from '../../../src/db/migrate.js';
import { definirIdioma } from '../../../src/db/repositories/idiomaBot.js';

const CHAVE_TESTE = 'chave-teste-handler-modelo';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-handler-modelo-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function criarContextoFake(chatId: number, texto: string) {
  return {
    chat: { id: chatId },
    message: { text: texto },
    reply: vi.fn(),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

describe('handlerModelo (/modelo)', () => {
  it('sem argumento, mostra o modelo ativo no chat', async () => {
    const handler = createHandlerModelo(db);
    const ctx = criarContextoFake(100, '/modelo');

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Modelo ativo neste chat'));
  });

  it('com argumento, troca o modelo e confirma', async () => {
    const handler = createHandlerModelo(db);
    const ctx = criarContextoFake(100, '/modelo openai/gpt-4o-mini');

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Modelo trocado para "openai/gpt-4o-mini"'));
  });

  it('com idioma en ativo, responde em inglês', async () => {
    definirIdioma(db, 'en');
    const handler = createHandlerModelo(db);
    const ctx = criarContextoFake(100, '/modelo');

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Active model in this chat'));
  });
});
