import type { Bot } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { registerRoutes } from '../../src/bot/router.js';

function criarBotFake() {
  return { on: vi.fn() } as unknown as Bot & { on: ReturnType<typeof vi.fn> };
}

describe('registerRoutes', () => {
  it('registra o handler de texto para mensagens de texto', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();

    registerRoutes(bot, handlerTexto, handlerMidia);

    expect(bot.on).toHaveBeenCalledWith('message:text', handlerTexto);
  });

  it('registra o handler de mídia para foto e documento', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();

    registerRoutes(bot, handlerTexto, handlerMidia);

    expect(bot.on).toHaveBeenCalledWith(['message:photo', 'message:document'], handlerMidia);
  });
});
