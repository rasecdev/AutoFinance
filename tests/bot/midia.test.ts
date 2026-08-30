import type { Context } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { createHandlerMidia } from '../../src/bot/handlers/midia.js';
import { createLogger } from '../../src/logging/logger.js';

function criarContextoFake(tipo: 'foto' | 'documento') {
  return {
    message: tipo === 'foto' ? { photo: [{ file_id: 'abc' }] } : { document: { file_id: 'xyz' } },
    reply: vi.fn(),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

describe('handlerMidia', () => {
  it('responde que o processamento de imagem/PDF ainda não está implementado', async () => {
    const handler = createHandlerMidia(createLogger({ write() {} }));
    const ctx = criarContextoFake('foto');

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      'Recebido — processamento de imagem/PDF ainda não implementado.',
    );
  });

  it('responde da mesma forma para documento (PDF)', async () => {
    const handler = createHandlerMidia(createLogger({ write() {} }));
    const ctx = criarContextoFake('documento');

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      'Recebido — processamento de imagem/PDF ainda não implementado.',
    );
  });
});
