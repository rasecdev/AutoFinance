import type { Bot } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { registerRoutes } from '../../src/bot/router.js';

function criarBotFake() {
  return { on: vi.fn(), command: vi.fn() } as unknown as Bot & {
    on: ReturnType<typeof vi.fn>;
    command: ReturnType<typeof vi.fn>;
  };
}

describe('registerRoutes', () => {
  it('registra o handler de texto para mensagens de texto', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();
    const handlerNaoSuportado = vi.fn();
    const handlerFeedback = vi.fn();

    registerRoutes(bot, handlerTexto, handlerMidia, handlerNaoSuportado, handlerFeedback);

    expect(bot.on).toHaveBeenCalledWith('message:text', handlerTexto);
  });

  it('registra o handler de mídia para foto e documento', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();
    const handlerNaoSuportado = vi.fn();
    const handlerFeedback = vi.fn();

    registerRoutes(bot, handlerTexto, handlerMidia, handlerNaoSuportado, handlerFeedback);

    expect(bot.on).toHaveBeenCalledWith(['message:photo', 'message:document'], handlerMidia);
  });

  it('registra o handler de fallback para qualquer outro tipo de mensagem', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();
    const handlerNaoSuportado = vi.fn();
    const handlerFeedback = vi.fn();

    registerRoutes(bot, handlerTexto, handlerMidia, handlerNaoSuportado, handlerFeedback);

    expect(bot.on).toHaveBeenCalledWith('message', handlerNaoSuportado);
  });

  it('registra o handler de feedback para o comando /errado', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();
    const handlerNaoSuportado = vi.fn();
    const handlerFeedback = vi.fn();

    registerRoutes(bot, handlerTexto, handlerMidia, handlerNaoSuportado, handlerFeedback);

    expect(bot.command).toHaveBeenCalledWith('errado', handlerFeedback);
  });
});
