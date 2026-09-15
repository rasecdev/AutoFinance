import type { Context } from 'grammy';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHandlerCodigoOAuthGoogle, createHandlerRegistrarEmail } from '../../../src/bot/handlers/registrarEmail.js';
import {
  definirPendenciaOAuthGoogle,
  obterPendenciaOAuthGoogle,
  removerPendenciaOAuthGoogle,
} from '../../../src/bot/googleOAuthPendencia.js';
import type { Env } from '../../../src/config/env.js';
import { createLogger } from '../../../src/logging/logger.js';

const logger = createLogger(undefined, 'fatal');

const ENV_BASE: Env = {
  ambiente: 'homologacao',
  telegramBotToken: 'token',
  telegramAllowedChatIds: ['1'],
  openrouterApiKey: 'chave',
  databasePath: './data/teste.db',
  databaseEncryptionKey: 'chave-cifragem',
  logLevel: 'info',
  google: null,
  googleOAuthClient: null,
};

function criarContextoFake(texto: string, chatId: number) {
  return {
    message: { text: texto },
    chat: { id: chatId },
    reply: vi.fn(),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

afterEach(() => {
  removerPendenciaOAuthGoogle(6001);
  removerPendenciaOAuthGoogle(6002);
  removerPendenciaOAuthGoogle(6003);
});

describe('handlerRegistrarEmail (/registrar_email)', () => {
  it('sem GOOGLE_CLIENT_ID/SECRET configurados, avisa que precisa configurar no servidor', async () => {
    const handler = createHandlerRegistrarEmail(ENV_BASE);
    const ctx = criarContextoFake('/registrar_email', 6001);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('GOOGLE_CLIENT_ID'));
    expect(obterPendenciaOAuthGoogle(6001)).toBeUndefined();
  });

  it('com par cliente configurado e sem vínculo ativo, gera link e cria pendência mencionando e-mail e calendário', async () => {
    const env: Env = { ...ENV_BASE, googleOAuthClient: { clientId: 'id-teste', clientSecret: 'secret-teste' } };
    const handler = createHandlerRegistrarEmail(env);
    const ctx = criarContextoFake('/registrar_email', 6002);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const mensagem = ctx.reply.mock.calls[0]?.[0] as string;
    expect(mensagem).toContain('Gmail');
    expect(mensagem).toContain('Calendar');
    expect(mensagem).toContain('https://accounts.google.com');
    expect(obterPendenciaOAuthGoogle(6002)).toBeDefined();
  });

  it('com vínculo já ativo e sem "confirmar", avisa que já está vinculado e não mexe na pendência', async () => {
    const env: Env = {
      ...ENV_BASE,
      googleOAuthClient: { clientId: 'id-teste', clientSecret: 'secret-teste' },
      google: { clientId: 'id-teste', clientSecret: 'secret-teste', refreshToken: 'refresh-teste', calendarId: 'primary' },
    };
    const handler = createHandlerRegistrarEmail(env);
    const ctx = criarContextoFake('/registrar_email', 6003);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('já tem uma conta Google vinculada'));
    expect(obterPendenciaOAuthGoogle(6003)).toBeUndefined();
  });

  it('com vínculo já ativo e "confirmar", gera um link novo mesmo assim', async () => {
    const env: Env = {
      ...ENV_BASE,
      googleOAuthClient: { clientId: 'id-teste', clientSecret: 'secret-teste' },
      google: { clientId: 'id-teste', clientSecret: 'secret-teste', refreshToken: 'refresh-teste', calendarId: 'primary' },
    };
    const handler = createHandlerRegistrarEmail(env);
    const ctx = criarContextoFake('/registrar_email confirmar', 6003);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('accounts.google.com'));
    expect(obterPendenciaOAuthGoogle(6003)).toBeDefined();
  });
});

describe('handlerCodigoOAuthGoogle', () => {
  it('sem pendência pro chat, não faz nada', async () => {
    const handler = createHandlerCodigoOAuthGoogle(logger);
    const ctx = criarContextoFake('algum-codigo', 6001);

    await handler(ctx);

    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('troca o código com sucesso e devolve o refresh_token, removendo a pendência', async () => {
    const getToken = vi.fn(async () => ({ tokens: { refresh_token: 'refresh-novo-123' } }));
    definirPendenciaOAuthGoogle(6002, { getToken } as never);

    const handler = createHandlerCodigoOAuthGoogle(logger);
    const ctx = criarContextoFake('4/0Acodigo', 6002);

    await handler(ctx);

    expect(getToken).toHaveBeenCalledWith('4/0Acodigo');
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('refresh-novo-123'));
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('GOOGLE_REFRESH_TOKEN'));
    expect(obterPendenciaOAuthGoogle(6002)).toBeUndefined();
  });

  it('sucesso sem refresh_token (conta já autorizada antes): orienta a revogar o acesso', async () => {
    const getToken = vi.fn(async () => ({ tokens: {} }));
    definirPendenciaOAuthGoogle(6002, { getToken } as never);

    const handler = createHandlerCodigoOAuthGoogle(logger);
    const ctx = criarContextoFake('4/0Acodigo', 6002);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('myaccount.google.com/permissions'));
  });

  it('código inválido/expirado: avisa e sugere rodar o comando de novo', async () => {
    const getToken = vi.fn(async () => {
      throw new Error('invalid_grant');
    });
    definirPendenciaOAuthGoogle(6002, { getToken } as never);

    const handler = createHandlerCodigoOAuthGoogle(logger);
    const ctx = criarContextoFake('codigo-invalido', 6002);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('/registrar_email'));
  });
});
