import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandlerNaoSuportado } from '../../../src/bot/handlers/naoSuportado.js';
import type { DbClient } from '../../../src/db/client.js';
import { migrate } from '../../../src/db/migrate.js';
import { definirIdioma } from '../../../src/db/repositories/idiomaBot.js';
import { createLogger } from '../../../src/logging/logger.js';

const CHAVE_TESTE = 'chave-teste-handler-nao-suportado';
const logger = createLogger(undefined, 'fatal');

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-handler-nao-suportado-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function criarContextoFake() {
  return {
    update: { update_id: 1 },
    reply: vi.fn(),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

describe('handlerNaoSuportado', () => {
  it('avisa que o tipo de mensagem não é suportado', async () => {
    const handler = createHandlerNaoSuportado(db, logger);
    const ctx = criarContextoFake();

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('não é suportado'));
  });

  it('com idioma en ativo, responde em inglês', async () => {
    definirIdioma(db, 'en');
    const handler = createHandlerNaoSuportado(db, logger);
    const ctx = criarContextoFake();

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('not supported'));
  });
});
