import type { Bot, Context } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { registerRoutes } from '../../src/bot/router.js';

function criarBotFake() {
  const filtro = vi.fn();
  const branch = { filter: filtro };
  const on = vi.fn().mockReturnValue(branch);
  return { on, filter: filtro } as unknown as Bot & {
    on: ReturnType<typeof vi.fn>;
    filter: ReturnType<typeof vi.fn>;
  };
}

function criarCtxComTexto(texto: string): Context {
  return { message: { text: texto } } as unknown as Context;
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

  it('registra o handler de feedback com um filtro pro comando /errado', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();
    const handlerNaoSuportado = vi.fn();
    const handlerFeedback = vi.fn();

    registerRoutes(bot, handlerTexto, handlerMidia, handlerNaoSuportado, handlerFeedback);

    expect(bot.filter).toHaveBeenCalledWith(expect.any(Function), handlerFeedback);
    const predicado = bot.filter.mock.calls[0]?.[0] as (ctx: Context) => boolean;
    expect(predicado(criarCtxComTexto('/errado'))).toBe(true);
    expect(predicado(criarCtxComTexto('/Errado'))).toBe(true);
    expect(predicado(criarCtxComTexto('/ERRADO mais alguma coisa'))).toBe(true);
    expect(predicado(criarCtxComTexto('não é o comando'))).toBe(false);
  });
});
