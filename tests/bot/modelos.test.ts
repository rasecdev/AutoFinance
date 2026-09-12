import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MODELO_PADRAO } from '../../src/ai/openrouter.js';
import { createHandlerModelo } from '../../src/bot/handlers/modelo.js';
import { createHandlerModelos } from '../../src/bot/handlers/modelos.js';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { definirRoteamento } from '../../src/db/repositories/roteamentoTarefas.js';

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
  return {
    chat: { id: chatId },
    reply: vi.fn(),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

describe('handlerModelos (/modelos)', () => {
  it('lista o modelo padrão de todos os fluxos quando nenhum roteamento foi configurado', async () => {
    const handler = createHandlerModelos(db);
    const ctx = criarContextoFake(6001);

    await handler(ctx);

    const texto = ctx.reply.mock.calls[0]?.[0] as string;
    expect(texto).toContain(`conversa_texto: ${MODELO_PADRAO}`);
    expect(texto).toContain('resumir_contexto: openai/gpt-4o-mini');
    expect(texto).toContain('relatorio_mensal: openai/gpt-4o-mini');
    expect(texto).toContain('analisar_qualidade: openai/gpt-4o-mini');
  });

  it('reflete o roteamento configurado por fluxo', async () => {
    definirRoteamento(db, 'conversa_texto', 'qwen/qwen3-32b');
    definirRoteamento(db, 'analisar_qualidade', 'deepseek/deepseek-v4-flash');
    const handler = createHandlerModelos(db);
    const ctx = criarContextoFake(6002);

    await handler(ctx);

    const texto = ctx.reply.mock.calls[0]?.[0] as string;
    expect(texto).toContain('conversa_texto: qwen/qwen3-32b');
    expect(texto).toContain('analisar_qualidade: deepseek/deepseek-v4-flash');
  });

  it('avisa sobre override manual do chat (/modelo) quando existe, sem afetar os outros fluxos', async () => {
    const handlerModelo = createHandlerModelo(db);
    await handlerModelo({
      message: { text: '/modelo openai/gpt-4o' },
      chat: { id: 6003 },
      reply: vi.fn(),
    } as unknown as Context);

    const handler = createHandlerModelos(db);
    const ctx = criarContextoFake(6003);
    await handler(ctx);

    const texto = ctx.reply.mock.calls[0]?.[0] as string;
    expect(texto).toContain('override manual ativo');
    expect(texto).toContain('openai/gpt-4o');
  });

  it('não menciona override quando o chat nunca usou /modelo', async () => {
    const handler = createHandlerModelos(db);
    const ctx = criarContextoFake(6004);

    await handler(ctx);

    const texto = ctx.reply.mock.calls[0]?.[0] as string;
    expect(texto).not.toContain('override manual ativo');
  });
});
