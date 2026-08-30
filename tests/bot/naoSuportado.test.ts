import type { Context } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { createHandlerNaoSuportado } from '../../src/bot/handlers/naoSuportado.js';
import { createLogger } from '../../src/logging/logger.js';

function criarContextoFake() {
  return {
    update: { update_id: 42 },
    reply: vi.fn(),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

describe('handlerNaoSuportado', () => {
  it('responde que o tipo de mensagem não é suportado', async () => {
    const handler = createHandlerNaoSuportado(createLogger({ write() {} }));
    const ctx = criarContextoFake();

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('Esse tipo de mensagem ainda não é suportado.');
  });
});
