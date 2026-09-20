import type { Context } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { COMANDOS_BOT } from '../../../src/bot/comandos.js';
import { createHandlerAjuda } from '../../../src/bot/handlers/ajuda.js';

function criarContextoFake() {
  return { reply: vi.fn(async () => ({ message_id: 1 })) } as unknown as Context & {
    reply: ReturnType<typeof vi.fn>;
  };
}

describe('handlerAjuda (/ajuda)', () => {
  it('lista todos os comandos de COMANDOS_BOT (fonte única, nunca desatualiza)', async () => {
    const handler = createHandlerAjuda();
    const ctx = criarContextoFake();

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const mensagem = ctx.reply.mock.calls[0]?.[0] as string;
    for (const { comando } of COMANDOS_BOT) {
      expect(mensagem).toContain(`/${comando}`);
    }
  });

  it('menciona pelo menos uma categoria do que dá pra pedir conversando', async () => {
    const handler = createHandlerAjuda();
    const ctx = criarContextoFake();

    await handler(ctx);

    const mensagem = ctx.reply.mock.calls[0]?.[0] as string;
    expect(mensagem).toContain('Dívidas e financiamentos');
    expect(mensagem).toContain('Qualidade da IA');
  });
});
