import type { Bot, Context } from 'grammy';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { definirPendenciaOAuthGoogle, removerPendenciaOAuthGoogle } from '../../src/bot/googleOAuthPendencia.js';
import { registerRoutes } from '../../src/bot/router.js';

afterEach(() => {
  removerPendenciaOAuthGoogle(9999);
});

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

function criarCtxComTextoEChat(texto: string, chatId: number): Context {
  return { message: { text: texto }, chat: { id: chatId } } as unknown as Context;
}

describe('registerRoutes', () => {
  it('registra o handler de texto para mensagens de texto', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();
    const handlerVoz = vi.fn();
    const handlerNaoSuportado = vi.fn();
    const handlerFeedback = vi.fn();
    const handlerFeedbackCorreto = vi.fn();
    const handlerModelo = vi.fn();
    const handlerModelos = vi.fn();
    const handlerRegistrarEmail = vi.fn();
    const handlerCodigoOAuthGoogle = vi.fn();
    const handlerAjuda = vi.fn();

    registerRoutes(
      bot,
      handlerTexto,
      handlerMidia,
      handlerVoz,
      handlerNaoSuportado,
      handlerFeedback,
      handlerFeedbackCorreto,
      handlerModelo,
      handlerModelos,
      handlerRegistrarEmail,
      handlerCodigoOAuthGoogle,
      handlerAjuda,
    );

    expect(bot.on).toHaveBeenCalledWith('message:text', handlerTexto);
  });

  it('registra o handler de mídia para foto e documento', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();
    const handlerVoz = vi.fn();
    const handlerNaoSuportado = vi.fn();
    const handlerFeedback = vi.fn();
    const handlerFeedbackCorreto = vi.fn();
    const handlerModelo = vi.fn();
    const handlerModelos = vi.fn();
    const handlerRegistrarEmail = vi.fn();
    const handlerCodigoOAuthGoogle = vi.fn();
    const handlerAjuda = vi.fn();

    registerRoutes(
      bot,
      handlerTexto,
      handlerMidia,
      handlerVoz,
      handlerNaoSuportado,
      handlerFeedback,
      handlerFeedbackCorreto,
      handlerModelo,
      handlerModelos,
      handlerRegistrarEmail,
      handlerCodigoOAuthGoogle,
      handlerAjuda,
    );

    expect(bot.on).toHaveBeenCalledWith(['message:photo', 'message:document'], handlerMidia);
  });

  it('registra o handler de voz para mensagem de voz', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();
    const handlerVoz = vi.fn();
    const handlerNaoSuportado = vi.fn();
    const handlerFeedback = vi.fn();
    const handlerFeedbackCorreto = vi.fn();
    const handlerModelo = vi.fn();
    const handlerModelos = vi.fn();
    const handlerRegistrarEmail = vi.fn();
    const handlerCodigoOAuthGoogle = vi.fn();
    const handlerAjuda = vi.fn();

    registerRoutes(
      bot,
      handlerTexto,
      handlerMidia,
      handlerVoz,
      handlerNaoSuportado,
      handlerFeedback,
      handlerFeedbackCorreto,
      handlerModelo,
      handlerModelos,
      handlerRegistrarEmail,
      handlerCodigoOAuthGoogle,
      handlerAjuda,
    );

    expect(bot.on).toHaveBeenCalledWith('message:voice', handlerVoz);
  });

  it('registra o handler de fallback para qualquer outro tipo de mensagem', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();
    const handlerVoz = vi.fn();
    const handlerNaoSuportado = vi.fn();
    const handlerFeedback = vi.fn();
    const handlerFeedbackCorreto = vi.fn();
    const handlerModelo = vi.fn();
    const handlerModelos = vi.fn();
    const handlerRegistrarEmail = vi.fn();
    const handlerCodigoOAuthGoogle = vi.fn();
    const handlerAjuda = vi.fn();

    registerRoutes(
      bot,
      handlerTexto,
      handlerMidia,
      handlerVoz,
      handlerNaoSuportado,
      handlerFeedback,
      handlerFeedbackCorreto,
      handlerModelo,
      handlerModelos,
      handlerRegistrarEmail,
      handlerCodigoOAuthGoogle,
      handlerAjuda,
    );

    expect(bot.on).toHaveBeenCalledWith('message', handlerNaoSuportado);
  });

  it('registra o handler de feedback com um filtro pro comando /errado', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();
    const handlerVoz = vi.fn();
    const handlerNaoSuportado = vi.fn();
    const handlerFeedback = vi.fn();
    const handlerFeedbackCorreto = vi.fn();
    const handlerModelo = vi.fn();
    const handlerModelos = vi.fn();
    const handlerRegistrarEmail = vi.fn();
    const handlerCodigoOAuthGoogle = vi.fn();
    const handlerAjuda = vi.fn();

    registerRoutes(
      bot,
      handlerTexto,
      handlerMidia,
      handlerVoz,
      handlerNaoSuportado,
      handlerFeedback,
      handlerFeedbackCorreto,
      handlerModelo,
      handlerModelos,
      handlerRegistrarEmail,
      handlerCodigoOAuthGoogle,
      handlerAjuda,
    );

    expect(bot.filter).toHaveBeenCalledWith(expect.any(Function), handlerFeedback);
    const predicado = bot.filter.mock.calls[0]?.[0] as (ctx: Context) => boolean;
    expect(predicado(criarCtxComTexto('/errado'))).toBe(true);
    expect(predicado(criarCtxComTexto('/Errado'))).toBe(true);
    expect(predicado(criarCtxComTexto('/ERRADO mais alguma coisa'))).toBe(true);
    expect(predicado(criarCtxComTexto('não é o comando'))).toBe(false);
  });

  it('registra o handler de feedback positivo com um filtro pro comando /certo', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();
    const handlerVoz = vi.fn();
    const handlerNaoSuportado = vi.fn();
    const handlerFeedback = vi.fn();
    const handlerFeedbackCorreto = vi.fn();
    const handlerModelo = vi.fn();
    const handlerModelos = vi.fn();
    const handlerRegistrarEmail = vi.fn();
    const handlerCodigoOAuthGoogle = vi.fn();
    const handlerAjuda = vi.fn();

    registerRoutes(
      bot,
      handlerTexto,
      handlerMidia,
      handlerVoz,
      handlerNaoSuportado,
      handlerFeedback,
      handlerFeedbackCorreto,
      handlerModelo,
      handlerModelos,
      handlerRegistrarEmail,
      handlerCodigoOAuthGoogle,
      handlerAjuda,
    );

    expect(bot.filter).toHaveBeenCalledWith(expect.any(Function), handlerFeedbackCorreto);
    const predicado = bot.filter.mock.calls[1]?.[0] as (ctx: Context) => boolean;
    expect(predicado(criarCtxComTexto('/certo'))).toBe(true);
    expect(predicado(criarCtxComTexto('/Certo'))).toBe(true);
    expect(predicado(criarCtxComTexto('/CERTO mais alguma coisa'))).toBe(true);
    expect(predicado(criarCtxComTexto('não é o comando'))).toBe(false);
    expect(predicado(criarCtxComTexto('/errado'))).toBe(false);
  });

  it('registra o handler de modelos (lista todos) com um filtro pro comando /modelos', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();
    const handlerVoz = vi.fn();
    const handlerNaoSuportado = vi.fn();
    const handlerFeedback = vi.fn();
    const handlerFeedbackCorreto = vi.fn();
    const handlerModelo = vi.fn();
    const handlerModelos = vi.fn();
    const handlerRegistrarEmail = vi.fn();
    const handlerCodigoOAuthGoogle = vi.fn();
    const handlerAjuda = vi.fn();

    registerRoutes(
      bot,
      handlerTexto,
      handlerMidia,
      handlerVoz,
      handlerNaoSuportado,
      handlerFeedback,
      handlerFeedbackCorreto,
      handlerModelo,
      handlerModelos,
      handlerRegistrarEmail,
      handlerCodigoOAuthGoogle,
      handlerAjuda,
    );

    expect(bot.filter).toHaveBeenCalledWith(expect.any(Function), handlerModelos);
    const predicado = bot.filter.mock.calls[2]?.[0] as (ctx: Context) => boolean;
    expect(predicado(criarCtxComTexto('/modelos'))).toBe(true);
    expect(predicado(criarCtxComTexto('/Modelos'))).toBe(true);
    expect(predicado(criarCtxComTexto('/modelo'))).toBe(false);
    expect(predicado(criarCtxComTexto('não é o comando'))).toBe(false);
  });

  it('registra o handler de modelo com um filtro pro comando /modelo, sem casar /modelos', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();
    const handlerVoz = vi.fn();
    const handlerNaoSuportado = vi.fn();
    const handlerFeedback = vi.fn();
    const handlerFeedbackCorreto = vi.fn();
    const handlerModelo = vi.fn();
    const handlerModelos = vi.fn();
    const handlerRegistrarEmail = vi.fn();
    const handlerCodigoOAuthGoogle = vi.fn();
    const handlerAjuda = vi.fn();

    registerRoutes(
      bot,
      handlerTexto,
      handlerMidia,
      handlerVoz,
      handlerNaoSuportado,
      handlerFeedback,
      handlerFeedbackCorreto,
      handlerModelo,
      handlerModelos,
      handlerRegistrarEmail,
      handlerCodigoOAuthGoogle,
      handlerAjuda,
    );

    expect(bot.filter).toHaveBeenCalledWith(expect.any(Function), handlerModelo);
    const predicado = bot.filter.mock.calls[3]?.[0] as (ctx: Context) => boolean;
    expect(predicado(criarCtxComTexto('/modelo'))).toBe(true);
    expect(predicado(criarCtxComTexto('/Modelo openai/gpt-4o'))).toBe(true);
    expect(predicado(criarCtxComTexto('/MODELO qwen/qwen3-32b'))).toBe(true);
    expect(predicado(criarCtxComTexto('/modelos'))).toBe(false);
    expect(predicado(criarCtxComTexto('não é o comando'))).toBe(false);
  });

  it('registra o handler de registrar_email com um filtro pro comando /registrar_email', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();
    const handlerVoz = vi.fn();
    const handlerNaoSuportado = vi.fn();
    const handlerFeedback = vi.fn();
    const handlerFeedbackCorreto = vi.fn();
    const handlerModelo = vi.fn();
    const handlerModelos = vi.fn();
    const handlerRegistrarEmail = vi.fn();
    const handlerCodigoOAuthGoogle = vi.fn();
    const handlerAjuda = vi.fn();

    registerRoutes(
      bot,
      handlerTexto,
      handlerMidia,
      handlerVoz,
      handlerNaoSuportado,
      handlerFeedback,
      handlerFeedbackCorreto,
      handlerModelo,
      handlerModelos,
      handlerRegistrarEmail,
      handlerCodigoOAuthGoogle,
      handlerAjuda,
    );

    expect(bot.filter).toHaveBeenCalledWith(expect.any(Function), handlerRegistrarEmail);
    const predicado = bot.filter.mock.calls[4]?.[0] as (ctx: Context) => boolean;
    expect(predicado(criarCtxComTexto('/registrar_email'))).toBe(true);
    expect(predicado(criarCtxComTexto('/Registrar_email confirmar'))).toBe(true);
    expect(predicado(criarCtxComTexto('não é o comando'))).toBe(false);
  });

  it('registra o handler de ajuda com um filtro pro comando /ajuda', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();
    const handlerVoz = vi.fn();
    const handlerNaoSuportado = vi.fn();
    const handlerFeedback = vi.fn();
    const handlerFeedbackCorreto = vi.fn();
    const handlerModelo = vi.fn();
    const handlerModelos = vi.fn();
    const handlerRegistrarEmail = vi.fn();
    const handlerCodigoOAuthGoogle = vi.fn();
    const handlerAjuda = vi.fn();

    registerRoutes(
      bot,
      handlerTexto,
      handlerMidia,
      handlerVoz,
      handlerNaoSuportado,
      handlerFeedback,
      handlerFeedbackCorreto,
      handlerModelo,
      handlerModelos,
      handlerRegistrarEmail,
      handlerCodigoOAuthGoogle,
      handlerAjuda,
    );

    expect(bot.filter).toHaveBeenCalledWith(expect.any(Function), handlerAjuda);
    const predicado = bot.filter.mock.calls[5]?.[0] as (ctx: Context) => boolean;
    expect(predicado(criarCtxComTexto('/ajuda'))).toBe(true);
    expect(predicado(criarCtxComTexto('/Ajuda'))).toBe(true);
    expect(predicado(criarCtxComTexto('não é o comando'))).toBe(false);
  });

  it('registra o handler de código OAuth do Google com filtro por pendência ativa no chat', () => {
    const bot = criarBotFake();
    const handlerTexto = vi.fn();
    const handlerMidia = vi.fn();
    const handlerVoz = vi.fn();
    const handlerNaoSuportado = vi.fn();
    const handlerFeedback = vi.fn();
    const handlerFeedbackCorreto = vi.fn();
    const handlerModelo = vi.fn();
    const handlerModelos = vi.fn();
    const handlerRegistrarEmail = vi.fn();
    const handlerCodigoOAuthGoogle = vi.fn();
    const handlerAjuda = vi.fn();

    registerRoutes(
      bot,
      handlerTexto,
      handlerMidia,
      handlerVoz,
      handlerNaoSuportado,
      handlerFeedback,
      handlerFeedbackCorreto,
      handlerModelo,
      handlerModelos,
      handlerRegistrarEmail,
      handlerCodigoOAuthGoogle,
      handlerAjuda,
    );

    expect(bot.filter).toHaveBeenCalledWith(expect.any(Function), handlerCodigoOAuthGoogle);
    const predicado = bot.filter.mock.calls[6]?.[0] as (ctx: Context) => boolean;

    expect(predicado(criarCtxComTextoEChat('4/0Acodigo-qualquer', 9999))).toBe(false);

    definirPendenciaOAuthGoogle(9999, {} as never);
    expect(predicado(criarCtxComTextoEChat('4/0Acodigo-qualquer', 9999))).toBe(true);
    expect(predicado(criarCtxComTextoEChat('qualquer coisa', 8888))).toBe(false);
  });
});
