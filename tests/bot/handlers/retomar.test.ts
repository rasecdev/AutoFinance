import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../../../src/db/client.js';
import { migrate } from '../../../src/db/migrate.js';
import { estaPausado, pausar } from '../../../src/db/repositories/botPausado.js';
import { createHandlerRetomar } from '../../../src/bot/handlers/retomar.js';

const CHAVE_TESTE = 'chave-teste-handler-retomar';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-handler-retomar-test-'));
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

describe('handlerRetomar', () => {
  it('remove a pausa e confirma', async () => {
    pausar(db, 100);
    const handler = createHandlerRetomar(db);
    const ctx = criarContextoFake(100);

    await handler(ctx);

    expect(estaPausado(db, 100)).toBe(false);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Bot retomado'));
  });

  it('chamado sem pausa ativa avisa que não havia pausa, sem erro', async () => {
    const handler = createHandlerRetomar(db);
    const ctx = criarContextoFake(100);

    await handler(ctx);

    expect(estaPausado(db, 100)).toBe(false);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Não havia pausa'));
  });
});
