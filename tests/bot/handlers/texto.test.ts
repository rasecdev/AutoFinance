import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Context } from 'grammy';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolDefinition } from '../../../src/ai/tools/types.js';
import { definirPendencia } from '../../../src/bot/confirmacao.js';
import { processarMensagemTexto } from '../../../src/bot/handlers/texto.js';
import type { DbClient } from '../../../src/db/client.js';
import {
  definirPendenciaPersistida,
  obterPendenciaPersistida,
} from '../../../src/db/repositories/confirmacoesPendentes.js';
import { migrate } from '../../../src/db/migrate.js';
import { createLogger } from '../../../src/logging/logger.js';

const CHAVE_TESTE = 'chave-teste-handler-texto-pendencia-persistida';
const logger = createLogger(undefined, 'fatal');

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-handler-texto-test-'));
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
  return {
    chat: { id: chatId },
    reply: vi.fn(async () => ({ message_id: 1 })),
    replyWithPhoto: vi.fn(async () => undefined),
    replyWithChatAction: vi.fn(async () => undefined),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

// Ver migration 0012 — pendência gravada por um processo separado do bot
// (lerEmailFaturas.ts, Fase 7), lida via banco em vez de memória.
describe('processarMensagemTexto — pendência persistida entre processos', () => {
  it('confirmado ("sim"): executa a tool e remove a pendência do banco', async () => {
    const handlerFalso = vi.fn(async () => 'feito com sucesso');
    const tool: ToolDefinition = { name: 'tool_teste', description: 'x', schema: {} as never, handler: handlerFalso };

    definirPendenciaPersistida(db, 777, { toolName: 'tool_teste', argumentos: { a: 1 } });

    const ctx = criarContextoFake(777);
    await processarMensagemTexto(ctx, db, {} as OpenAI, logger, [tool], 'sim', 777);

    expect(handlerFalso).toHaveBeenCalledWith({ a: 1 }, { chatId: 777 });
    expect(ctx.reply).toHaveBeenCalledWith('feito com sucesso');
    expect(obterPendenciaPersistida(db, 777)).toBeUndefined();
  });

  it('não afirmativo: cancela sem executar a tool, remove a pendência mesmo assim', async () => {
    const handlerFalso = vi.fn(async () => 'não deveria rodar');
    const tool: ToolDefinition = { name: 'tool_teste', description: 'x', schema: {} as never, handler: handlerFalso };

    definirPendenciaPersistida(db, 778, { toolName: 'tool_teste', argumentos: {} });

    const ctx = criarContextoFake(778);
    await processarMensagemTexto(ctx, db, {} as OpenAI, logger, [tool], 'não quero', 778);

    expect(handlerFalso).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith('Ação cancelada.');
    expect(obterPendenciaPersistida(db, 778)).toBeUndefined();
  });

  it('tool referenciada não existe mais na lista atual: avisa erro, não quebra', async () => {
    definirPendenciaPersistida(db, 779, { toolName: 'tool_que_sumiu', argumentos: {} });

    const ctx = criarContextoFake(779);
    await processarMensagemTexto(ctx, db, {} as OpenAI, logger, [], 'sim', 779);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Não consegui concluir'));
  });

  it('pendência em memória (confirmacao.ts) tem prioridade sobre a persistida no banco', async () => {
    const handlerMemoria = vi.fn(async () => 'memoria executada');
    definirPendencia(780, {
      tool: { name: 'x', description: 'x', schema: {} as never, handler: handlerMemoria },
      argumentos: {},
    });
    definirPendenciaPersistida(db, 780, { toolName: 'nao_deveria_rodar', argumentos: {} });

    const ctx = criarContextoFake(780);
    await processarMensagemTexto(ctx, db, {} as OpenAI, logger, [], 'sim', 780);

    expect(handlerMemoria).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith('memoria executada');
    expect(obterPendenciaPersistida(db, 780)).toBeDefined();
  });
});
