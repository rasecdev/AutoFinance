import type { Context } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { createAllowlistMiddleware } from '../../src/bot/middleware/allowlist.js';
import { createLogger } from '../../src/logging/logger.js';

function criarLoggerSilencioso() {
  return createLogger({ write() {} });
}

function criarContextoFake(chatId: number | undefined): Context {
  return { chat: chatId === undefined ? undefined : { id: chatId } } as unknown as Context;
}

describe('allowlist middleware', () => {
  it('permite chat_id presente na allowlist e chama next', async () => {
    const middleware = createAllowlistMiddleware(['123'], criarLoggerSilencioso());
    const next = vi.fn();

    await middleware(criarContextoFake(123), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('bloqueia chat_id fora da allowlist, sem chamar next', async () => {
    const middleware = createAllowlistMiddleware(['123'], criarLoggerSilencioso());
    const next = vi.fn();

    await middleware(criarContextoFake(999), next);

    expect(next).not.toHaveBeenCalled();
  });

  it('bloqueia update sem chat, sem chamar next', async () => {
    const middleware = createAllowlistMiddleware(['123'], criarLoggerSilencioso());
    const next = vi.fn();

    await middleware(criarContextoFake(undefined), next);

    expect(next).not.toHaveBeenCalled();
  });
});
