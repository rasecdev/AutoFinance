import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Context } from 'grammy';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
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

function criarClienteFalsoComToolCall(nomeTool: string, argumentos: unknown) {
  const create = vi.fn(async () => ({
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            { id: 'call-1', type: 'function', function: { name: nomeTool, arguments: JSON.stringify(argumentos) } },
          ],
        },
      },
    ],
  }));
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

// Achado real de teste manual (Fase 8): usuário achou o "digite sim" confuso
// — a pergunta de confirmação agora vem com um teclado inline (botões
// Sim/Cancelar) anexado à mensagem, além de continuar aceitando texto.
describe('processarMensagemTexto — pergunta de confirmação nova vem com teclado inline', () => {
  it('tool com requerConfirmacao: envia a pergunta com reply_markup (botões Sim/Cancelar)', async () => {
    const tool: ToolDefinition = {
      name: 'criar_cartao',
      description: 'x',
      schema: z.object({ nome: z.string() }),
      requerConfirmacao: true,
      resumoConfirmacao: () => 'criar o cartão "Nubank"',
      handler: vi.fn(async () => 'não deveria rodar ainda'),
    };
    const client = criarClienteFalsoComToolCall('criar_cartao', { nome: 'Nubank' });

    const ctx = criarContextoFake(781);
    await processarMensagemTexto(ctx, db, client, logger, [tool], 'cria um cartão nubank', 781);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Confirma criar o cartão "Nubank"?'),
      { reply_markup: expect.objectContaining({ inline_keyboard: expect.any(Array) }) },
    );
  });

  it('resposta de texto normal (sem pendência): não anexa reply_markup nenhum', async () => {
    const client = {
      chat: { completions: { create: vi.fn(async () => ({ choices: [{ message: { content: 'olá!' } }] })) } },
    } as unknown as OpenAI;

    const ctx = criarContextoFake(782);
    await processarMensagemTexto(ctx, db, client, logger, [], 'oi', 782);

    expect(ctx.reply).toHaveBeenCalledWith('olá!', undefined);
  });
});
