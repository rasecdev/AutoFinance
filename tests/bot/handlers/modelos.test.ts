import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandlerModelos } from '../../../src/bot/handlers/modelos.js';
import { definirModeloAtivo } from '../../../src/bot/modeloAtivo.js';
import type { DbClient } from '../../../src/db/client.js';
import { migrate } from '../../../src/db/migrate.js';
import { definirIdioma } from '../../../src/db/repositories/idiomaBot.js';

const CHAVE_TESTE = 'chave-teste-handler-modelos';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-handler-modelos-test-'));
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

describe('handlerModelos (/modelos)', () => {
  it('lista os fluxos roteados', async () => {
    const handler = createHandlerModelos(db);
    const ctx = criarContextoFake(100);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Modelos por fluxo:'));
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('conversa_texto'));
  });

  it('com override manual ativo no chat, menciona o override', async () => {
    definirModeloAtivo(100, 'openai/gpt-4o-mini');
    const handler = createHandlerModelos(db);
    const ctx = criarContextoFake(100);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('override manual ativo'));
  });

  it('com idioma en ativo, responde em inglês', async () => {
    definirIdioma(db, 'en');
    const handler = createHandlerModelos(db);
    const ctx = criarContextoFake(100);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Models per flow:'));
  });
});
