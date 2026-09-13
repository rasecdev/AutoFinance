import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Context } from 'grammy';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../../../src/db/client.js';
import { migrate } from '../../../src/db/migrate.js';
import { listarUsoTokensPeriodo } from '../../../src/db/repositories/usoTokens.js';
import { createLogger } from '../../../src/logging/logger.js';

const processarMensagemTextoMock = vi.fn(async () => undefined);
vi.mock('../../../src/bot/handlers/texto.js', () => ({
  processarMensagemTexto: processarMensagemTextoMock,
}));

const { createHandlerVoz } = await import('../../../src/bot/handlers/voz.js');

const CHAVE_TESTE = 'chave-teste-handler-voz';
const BOT_TOKEN = 'fake-token';

let dir: string;
let db: DbClient;

function criarContextoFake() {
  return {
    chat: { id: 123 },
    getFile: vi.fn(async () => ({ file_path: 'voice/file_1.oga' })),
    reply: vi.fn(),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn>; getFile: ReturnType<typeof vi.fn> };
}

function criarClienteFalso(resposta: unknown) {
  return { audio: { transcriptions: { create: vi.fn(async () => resposta) } } } as unknown as OpenAI;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-handler-voz-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  processarMensagemTextoMock.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(4) }) as unknown as Response),
  );
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('handlerVoz', () => {
  it('transcreve com sucesso e delega pro pipeline de texto com o texto transcrito', async () => {
    const client = criarClienteFalso({ text: 'registra 20 reais de uber', usage: { cost: 0.0001 } });
    const handler = createHandlerVoz(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoFake();

    await handler(ctx);

    expect(processarMensagemTextoMock).toHaveBeenCalledWith(
      ctx,
      db,
      client,
      expect.anything(),
      expect.anything(),
      'registra 20 reais de uber',
      123,
    );
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('registra o custo da transcrição em uso_tokens com fluxo transcricao_voz', async () => {
    const client = criarClienteFalso({ text: 'oi', usage: { cost: 0.0001 } });
    const handler = createHandlerVoz(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoFake();

    await handler(ctx);

    const registros = listarUsoTokensPeriodo(db, { inicio: '1970-01-01', fim: '2999-01-01' });
    expect(registros).toEqual([expect.objectContaining({ fluxo: 'transcricao_voz', custoEstimado: 0.0001 })]);
  });

  it('falha na transcrição responde mensagem de erro, sem propagar exceção', async () => {
    const client = {
      audio: { transcriptions: { create: vi.fn(async () => Promise.reject(new Error('API fora'))) } },
    } as unknown as OpenAI;
    const handler = createHandlerVoz(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoFake();

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('Não consegui entender o áudio, tenta de novo ou manda por texto.');
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('transcrição vazia responde mensagem de erro, sem delegar pro pipeline de texto', async () => {
    const client = criarClienteFalso({ text: '   ' });
    const handler = createHandlerVoz(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoFake();

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('Não consegui entender o áudio, tenta de novo ou manda por texto.');
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('sem chatId, não faz nada', async () => {
    const client = criarClienteFalso({ text: 'oi' });
    const handler = createHandlerVoz(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = { chat: undefined, getFile: vi.fn(), reply: vi.fn() } as unknown as Context & {
      reply: ReturnType<typeof vi.fn>;
    };

    await handler(ctx);

    expect(ctx.reply).not.toHaveBeenCalled();
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });
});
