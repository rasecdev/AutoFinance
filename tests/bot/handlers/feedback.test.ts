import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandlerFeedback } from '../../../src/bot/handlers/feedback.js';
import { definirRastroResposta } from '../../../src/bot/rastroRespostas.js';
import type { DbClient } from '../../../src/db/client.js';
import { migrate } from '../../../src/db/migrate.js';
import { definirIdioma } from '../../../src/db/repositories/idiomaBot.js';
import { registrarInteracaoIa } from '../../../src/db/repositories/interacoesIa.js';
import { createLogger } from '../../../src/logging/logger.js';

const CHAVE_TESTE = 'chave-teste-handler-feedback';
const logger = createLogger(undefined, 'fatal');

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-handler-feedback-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function criarContextoFake(mensagemRespondidaId?: number) {
  return {
    message: mensagemRespondidaId === undefined ? {} : { reply_to_message: { message_id: mensagemRespondidaId } },
    reply: vi.fn(),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

describe('handlerFeedback (/errado, /certo)', () => {
  it('sem reply, pede pra responder diretamente à mensagem do bot', async () => {
    const handler = createHandlerFeedback(db, logger, 'incorreto');
    const ctx = criarContextoFake();

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('incorreto'));
  });

  it('com rastro de resposta existente, marca a avaliação e confirma', async () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-1',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'oi',
      respostaModelo: 'olá',
      toolCalls: [],
      resultado: 'sucesso',
      chatId: 100,
      tokensPrompt: 1,
      tokensCompletion: 1,
    });
    definirRastroResposta(42, 'trace-1');

    const handler = createHandlerFeedback(db, logger, 'correto');
    const ctx = criarContextoFake(42);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Marcado como correto'));
  });

  it('com idioma en ativo, responde em inglês', async () => {
    definirIdioma(db, 'en');
    const handler = createHandlerFeedback(db, logger, 'incorreto');
    const ctx = criarContextoFake();

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('incorrect'));
  });
});
