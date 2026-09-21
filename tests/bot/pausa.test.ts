import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { pausar } from '../../src/db/repositories/botPausado.js';
import { createPausaMiddleware } from '../../src/bot/middleware/pausa.js';

const CHAVE_TESTE = 'chave-teste-pausa-middleware';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-pausa-middleware-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function criarContextoTexto(chatId: number, texto: string): Context {
  return {
    chat: { id: chatId },
    message: { text: texto },
    reply: vi.fn(),
  } as unknown as Context;
}

function criarContextoCallback(chatId: number): Context {
  return {
    chat: { id: chatId },
    callbackQuery: { data: 'confirmar' },
    answerCallbackQuery: vi.fn(),
  } as unknown as Context;
}

describe('pausa middleware', () => {
  it('chat não pausado: chama next sem mudar comportamento', async () => {
    const middleware = createPausaMiddleware(db);
    const next = vi.fn();

    await middleware(criarContextoTexto(100, 'oi'), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('chat pausado: recusa mensagem de texto normal, sem chamar next', async () => {
    pausar(db, 100);
    const middleware = createPausaMiddleware(db);
    const next = vi.fn();
    const ctx = criarContextoTexto(100, 'gastei 30 reais no mercado');

    await middleware(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('/retomar'));
  });

  it('chat pausado: deixa passar /pausar', async () => {
    pausar(db, 100);
    const middleware = createPausaMiddleware(db);
    const next = vi.fn();

    await middleware(criarContextoTexto(100, '/pausar'), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('chat pausado: deixa passar /retomar', async () => {
    pausar(db, 100);
    const middleware = createPausaMiddleware(db);
    const next = vi.fn();

    await middleware(criarContextoTexto(100, '/retomar'), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('chat pausado: recusa clique em botão de confirmação (callback_query), sem chamar next', async () => {
    pausar(db, 100);
    const middleware = createPausaMiddleware(db);
    const next = vi.fn();
    const ctx = criarContextoCallback(100);

    await middleware(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledOnce();
  });

  it('pausa de um chat não bloqueia outro chat', async () => {
    pausar(db, 100);
    const middleware = createPausaMiddleware(db);
    const next = vi.fn();

    await middleware(criarContextoTexto(200, 'oi'), next);

    expect(next).toHaveBeenCalledOnce();
  });
});
