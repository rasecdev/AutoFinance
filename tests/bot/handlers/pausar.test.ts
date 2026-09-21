import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../../../src/db/client.js';
import { migrate } from '../../../src/db/migrate.js';
import { estaPausado, pausar } from '../../../src/db/repositories/botPausado.js';
import { createHandlerPausar } from '../../../src/bot/handlers/pausar.js';

const CHAVE_TESTE = 'chave-teste-handler-pausar';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-handler-pausar-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function criarContextoFake(chatId: number) {
  return { chat: { id: chatId }, reply: vi.fn() } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

describe('handlerPausar', () => {
  it('grava a pausa e confirma', async () => {
    const handler = createHandlerPausar(db);
    const ctx = criarContextoFake(100);

    await handler(ctx);

    expect(estaPausado(db, 100)).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Bot pausado'));
  });

  it('chamado com o chat já pausado avisa que já estava pausado, sem erro', async () => {
    pausar(db, 100);
    const handler = createHandlerPausar(db);
    const ctx = criarContextoFake(100);

    await handler(ctx);

    expect(estaPausado(db, 100)).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Já estava pausado'));
  });
});
