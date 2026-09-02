import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from 'grammy';
import { createHandlerFeedback } from '../../src/bot/handlers/feedback.js';
import { definirRastroResposta } from '../../src/bot/rastroRespostas.js';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { registrarInteracaoIa } from '../../src/db/repositories/interacoesIa.js';
import { createLogger } from '../../src/logging/logger.js';

const CHAVE_TESTE = 'chave-teste-feedback';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-feedback-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function lerInteracoes() {
  return db.prepare('SELECT * FROM interacoes_ia').all() as Array<Record<string, unknown>>;
}

function criarContextoFake(replyToMessageId?: number) {
  return {
    message: {
      reply_to_message: replyToMessageId !== undefined ? { message_id: replyToMessageId } : undefined,
    },
    reply: vi.fn(),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

describe('handlerFeedback (/errado)', () => {
  it('pede pra responder à mensagem do bot quando não é um reply', async () => {
    const logger = createLogger({ write() {} });
    const handler = createHandlerFeedback(db, logger);
    const ctx = criarContextoFake(undefined);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('responda (reply)'));
  });

  it('avisa quando não encontra o rastro da mensagem respondida', async () => {
    const logger = createLogger({ write() {} });
    const handler = createHandlerFeedback(db, logger);
    const ctx = criarContextoFake(999999);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Não encontrei'));
  });

  it('marca a interação como incorreta quando o rastro existe', async () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-feedback-1',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'quanto gastei em março?',
      respostaModelo: 'você gastou R$ 1000',
      resultado: 'sucesso',
    });
    definirRastroResposta(42, 'trace-feedback-1');

    const logger = createLogger({ write() {} });
    const handler = createHandlerFeedback(db, logger);
    const ctx = criarContextoFake(42);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Marcado como incorreto'));
    const linhas = lerInteracoes();
    expect(linhas[0]).toMatchObject({ avaliacao_usuario: 'incorreto' });
  });
});
