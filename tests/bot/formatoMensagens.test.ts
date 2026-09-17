import { Bot } from 'grammy';
import { describe, expect, it } from 'vitest';
import { configurarFormatacaoPadrao } from '../../src/bot/formatoMensagens.js';

const TOKEN_FAKE = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';

// Registra o mock ANTES de configurarFormatacaoPadrao: grammy compõe
// transformers do último registrado (mais externo) pro primeiro (mais
// interno, perto da chamada real) — registrar nessa ordem faz o mock
// substituir a chamada real à API, com nosso transformer por fora dele.
function criarBotComMock(respostaMock: (method: string, payload: Record<string, unknown>) => unknown) {
  const bot = new Bot(TOKEN_FAKE);
  bot.api.config.use(async (_prev, method, payload) => respostaMock(method, payload) as never);
  configurarFormatacaoPadrao(bot);
  return bot;
}

describe('configurarFormatacaoPadrao', () => {
  it('aplica parse_mode HTML por padrão em sendMessage', async () => {
    let payloadRecebido: Record<string, unknown> = {};
    const bot = criarBotComMock((_method, payload) => {
      payloadRecebido = payload;
      return { ok: true, result: {} };
    });

    await bot.api.sendMessage(123, 'texto');

    expect(payloadRecebido.parse_mode).toBe('HTML');
  });

  it('não sobrescreve parse_mode já definido explicitamente', async () => {
    let payloadRecebido: Record<string, unknown> = {};
    const bot = criarBotComMock((_method, payload) => {
      payloadRecebido = payload;
      return { ok: true, result: {} };
    });

    await bot.api.sendMessage(123, 'texto', { parse_mode: 'MarkdownV2' });

    expect(payloadRecebido.parse_mode).toBe('MarkdownV2');
  });

  it('reenvia sem parse_mode quando o Telegram recusa por HTML malformado', async () => {
    const payloadsRecebidos: Record<string, unknown>[] = [];
    const bot = criarBotComMock((_method, payload) => {
      payloadsRecebidos.push(payload);
      if (payload.parse_mode === 'HTML') {
        return {
          ok: false,
          error_code: 400,
          description: "Bad Request: can't parse entities: Unsupported start tag",
        };
      }
      return { ok: true, result: {} };
    });

    const resultado = await bot.api.sendMessage(123, 'gastei < 100');

    expect(resultado).toBeDefined();
    expect(payloadsRecebidos).toHaveLength(2);
    expect(payloadsRecebidos[0]!.parse_mode).toBe('HTML');
    expect(payloadsRecebidos[1]!.parse_mode).toBeUndefined();
  });

  it('propaga outros erros da API sem reenviar', async () => {
    const payloadsRecebidos: Record<string, unknown>[] = [];
    const bot = criarBotComMock((_method, payload) => {
      payloadsRecebidos.push(payload);
      return { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' };
    });

    await expect(bot.api.sendMessage(123, 'texto')).rejects.toThrow('Forbidden');
    expect(payloadsRecebidos).toHaveLength(1);
  });

  it('não mexe em métodos diferentes de sendMessage', async () => {
    let payloadRecebido: Record<string, unknown> = {};
    const bot = criarBotComMock((_method, payload) => {
      payloadRecebido = payload;
      return { ok: true, result: true };
    });

    await bot.api.deleteMessage(123, 456);

    expect(payloadRecebido.parse_mode).toBeUndefined();
  });
});
