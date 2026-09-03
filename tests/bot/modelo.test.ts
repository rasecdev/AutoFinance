import type { Context } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { MODELO_PADRAO } from '../../src/ai/openrouter.js';
import { createHandlerModelo } from '../../src/bot/handlers/modelo.js';
import { obterModeloAtivo } from '../../src/bot/modeloAtivo.js';

function criarContextoFake(texto: string, chatId: number) {
  return {
    message: { text: texto },
    chat: { id: chatId },
    reply: vi.fn(),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

describe('handlerModelo (/modelo)', () => {
  it('informa o modelo padrão quando o chat nunca trocou e o comando vem sem argumento', async () => {
    const handler = createHandlerModelo();
    const ctx = criarContextoFake('/modelo', 5001);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining(MODELO_PADRAO));
  });

  it('troca o modelo ativo do chat quando o comando vem com argumento', async () => {
    const handler = createHandlerModelo();
    const ctx = criarContextoFake('/modelo openai/gpt-4o', 5002);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('openai/gpt-4o'));
    expect(obterModeloAtivo(5002)).toBe('openai/gpt-4o');
  });

  it('informa o modelo já trocado quando o comando vem sem argumento depois de uma troca', async () => {
    const handler = createHandlerModelo();
    await handler(criarContextoFake('/modelo qwen/qwen3-32b', 5003));

    const ctx = criarContextoFake('/modelo', 5003);
    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('qwen/qwen3-32b'));
  });

  it('isola a troca de modelo entre chats diferentes', async () => {
    const handler = createHandlerModelo();
    await handler(criarContextoFake('/modelo openai/gpt-4o', 5004));
    await handler(criarContextoFake('/modelo qwen/qwen3-32b', 5005));

    expect(obterModeloAtivo(5004)).toBe('openai/gpt-4o');
    expect(obterModeloAtivo(5005)).toBe('qwen/qwen3-32b');
  });

  it('aceita o nome do modelo mesmo com espaços extras ao redor', async () => {
    const handler = createHandlerModelo();
    const ctx = criarContextoFake('/modelo   openai/gpt-4o  ', 5006);

    await handler(ctx);

    expect(obterModeloAtivo(5006)).toBe('openai/gpt-4o');
  });
});
