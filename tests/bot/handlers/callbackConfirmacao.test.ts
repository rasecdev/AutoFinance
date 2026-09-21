import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolDefinition } from '../../../src/ai/tools/types.js';
import { CALLBACK_DATA_CANCELAR, CALLBACK_DATA_CONFIRMAR, definirPendencia, obterPendencia } from '../../../src/bot/confirmacao.js';
import { createHandlerCallbackConfirmacao } from '../../../src/bot/handlers/callbackConfirmacao.js';
import type { DbClient } from '../../../src/db/client.js';
import { definirPendenciaPersistida, obterPendenciaPersistida } from '../../../src/db/repositories/confirmacoesPendentes.js';
import { migrate } from '../../../src/db/migrate.js';
import { createLogger } from '../../../src/logging/logger.js';

const CHAVE_TESTE = 'chave-teste-handler-callback-confirmacao';
const logger = createLogger(undefined, 'fatal');

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-handler-callback-confirmacao-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function criarContextoFake(chatId: number, dados: string) {
  return {
    chat: { id: chatId },
    callbackQuery: { data: dados },
    reply: vi.fn(async () => ({ message_id: 1 })),
    replyWithPhoto: vi.fn(async () => undefined),
    answerCallbackQuery: vi.fn(async () => true),
    editMessageReplyMarkup: vi.fn(async () => true),
  } as unknown as Context & {
    reply: ReturnType<typeof vi.fn>;
    answerCallbackQuery: ReturnType<typeof vi.fn>;
    editMessageReplyMarkup: ReturnType<typeof vi.fn>;
  };
}

describe('handlerCallbackConfirmacao — pendência em memória (confirmacao.ts)', () => {
  it('botão "Sim": executa a tool, remove a pendência e tira o teclado da mensagem', async () => {
    const handlerFalso = vi.fn(async () => 'feito com sucesso');
    const tool: ToolDefinition = { name: 'tool_teste', description: 'x', schema: {} as never, handler: handlerFalso };
    definirPendencia(9001, { tool, argumentos: { a: 1 } });

    const ctx = criarContextoFake(9001, CALLBACK_DATA_CONFIRMAR);
    const handler = createHandlerCallbackConfirmacao(db, logger, []);
    await handler(ctx);

    expect(handlerFalso).toHaveBeenCalledWith({ a: 1 }, { chatId: 9001 });
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith('feito com sucesso');
    expect(obterPendencia(9001)).toBeUndefined();
  });

  it('botão "Cancelar": cancela sem executar a tool', async () => {
    const handlerFalso = vi.fn(async () => 'não deveria rodar');
    const tool: ToolDefinition = { name: 'tool_teste', description: 'x', schema: {} as never, handler: handlerFalso };
    definirPendencia(9002, { tool, argumentos: {} });

    const ctx = criarContextoFake(9002, CALLBACK_DATA_CANCELAR);
    const handler = createHandlerCallbackConfirmacao(db, logger, []);
    await handler(ctx);

    expect(handlerFalso).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith('Ação cancelada.');
    expect(obterPendencia(9002)).toBeUndefined();
  });

  it('sem pendência (clique em botão antigo/expirado): avisa e não executa nada', async () => {
    const ctx = criarContextoFake(9003, CALLBACK_DATA_CONFIRMAR);
    const handler = createHandlerCallbackConfirmacao(db, logger, []);
    await handler(ctx);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({ text: 'Isso já foi respondido ou expirou.' });
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});

describe('handlerCallbackConfirmacao — pendência persistida entre processos (confirmacoes_pendentes)', () => {
  it('botão "Sim": resolve a tool pelo nome na lista atual, executa e remove do banco', async () => {
    const handlerFalso = vi.fn(async () => 'fatura registrada');
    const tool: ToolDefinition = { name: 'tool_persistida', description: 'x', schema: {} as never, handler: handlerFalso };
    definirPendenciaPersistida(db, 9004, { toolName: 'tool_persistida', argumentos: { b: 2 } });

    const ctx = criarContextoFake(9004, CALLBACK_DATA_CONFIRMAR);
    const handler = createHandlerCallbackConfirmacao(db, logger, [tool]);
    await handler(ctx);

    expect(handlerFalso).toHaveBeenCalledWith({ b: 2 }, { chatId: 9004 });
    expect(ctx.reply).toHaveBeenCalledWith('fatura registrada');
    expect(obterPendenciaPersistida(db, 9004)).toBeUndefined();
  });

  it('tool referenciada não existe mais na lista atual: avisa erro, não quebra', async () => {
    definirPendenciaPersistida(db, 9005, { toolName: 'tool_que_sumiu', argumentos: {} });

    const ctx = criarContextoFake(9005, CALLBACK_DATA_CONFIRMAR);
    const handler = createHandlerCallbackConfirmacao(db, logger, []);
    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Não consegui concluir'));
  });

  it('pendência em memória tem prioridade sobre a persistida no banco', async () => {
    const handlerMemoria = vi.fn(async () => 'memoria executada');
    definirPendencia(9006, {
      tool: { name: 'x', description: 'x', schema: {} as never, handler: handlerMemoria },
      argumentos: {},
    });
    definirPendenciaPersistida(db, 9006, { toolName: 'nao_deveria_rodar', argumentos: {} });

    const ctx = criarContextoFake(9006, CALLBACK_DATA_CONFIRMAR);
    const handler = createHandlerCallbackConfirmacao(db, logger, []);
    await handler(ctx);

    expect(handlerMemoria).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith('memoria executada');
    expect(obterPendenciaPersistida(db, 9006)).toBeDefined();
  });
});
