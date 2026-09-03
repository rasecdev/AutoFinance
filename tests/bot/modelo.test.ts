import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MODELO_PADRAO } from '../../src/ai/openrouter.js';
import { createHandlerModelo } from '../../src/bot/handlers/modelo.js';
import { obterOverrideModelo } from '../../src/bot/modeloAtivo.js';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { definirRoteamento } from '../../src/db/repositories/roteamentoTarefas.js';

const CHAVE_TESTE = 'chave-teste-handler-modelo';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-handler-modelo-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function criarContextoFake(texto: string, chatId: number) {
  return {
    message: { text: texto },
    chat: { id: chatId },
    reply: vi.fn(),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

describe('handlerModelo (/modelo)', () => {
  it('informa o modelo padrão quando o chat nunca trocou e o comando vem sem argumento', async () => {
    const handler = createHandlerModelo(db);
    const ctx = criarContextoFake('/modelo', 5001);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining(MODELO_PADRAO));
  });

  it('troca o modelo ativo do chat quando o comando vem com argumento', async () => {
    const handler = createHandlerModelo(db);
    const ctx = criarContextoFake('/modelo openai/gpt-4o', 5002);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('openai/gpt-4o'));
    expect(obterOverrideModelo(5002)).toBe('openai/gpt-4o');
  });

  it('informa o modelo já trocado quando o comando vem sem argumento depois de uma troca', async () => {
    const handler = createHandlerModelo(db);
    await handler(criarContextoFake('/modelo qwen/qwen3-32b', 5003));

    const ctx = criarContextoFake('/modelo', 5003);
    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('qwen/qwen3-32b'));
  });

  it('isola a troca de modelo entre chats diferentes', async () => {
    const handler = createHandlerModelo(db);
    await handler(criarContextoFake('/modelo openai/gpt-4o', 5004));
    await handler(criarContextoFake('/modelo qwen/qwen3-32b', 5005));

    expect(obterOverrideModelo(5004)).toBe('openai/gpt-4o');
    expect(obterOverrideModelo(5005)).toBe('qwen/qwen3-32b');
  });

  it('aceita o nome do modelo mesmo com espaços extras ao redor', async () => {
    const handler = createHandlerModelo(db);
    const ctx = criarContextoFake('/modelo   openai/gpt-4o  ', 5006);

    await handler(ctx);

    expect(obterOverrideModelo(5006)).toBe('openai/gpt-4o');
  });

  it('mostra o modelo de roteamento_tarefas quando o chat nunca sobrescreveu (Fase 5, Tarefa 22)', async () => {
    definirRoteamento(db, 'conversa_texto', 'qwen/qwen3-32b');
    const handler = createHandlerModelo(db);
    const ctx = criarContextoFake('/modelo', 5007);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('qwen/qwen3-32b'));
  });
});
