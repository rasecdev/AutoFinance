import type { Bot } from 'grammy';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/config/env.js';
import { createLogger } from '../../src/logging/logger.js';

vi.mock('../../src/canais/whatsapp.js', () => ({
  enviarTextoWhatsapp: vi.fn().mockResolvedValue(undefined),
  enviarImagemWhatsapp: vi.fn().mockResolvedValue(undefined),
  enviarDocumentoWhatsapp: vi.fn().mockResolvedValue(undefined),
}));

const { enviarTextoWhatsapp, enviarImagemWhatsapp, enviarDocumentoWhatsapp } = await import(
  '../../src/canais/whatsapp.js'
);
const { notificarTexto, notificarImagem, notificarDocumento } = await import('../../src/canais/notificar.js');

function criarLoggerSilencioso() {
  return createLogger({ write() {} });
}

const ENV_BASE: Env = {
  ambiente: 'homologacao',
  telegramBotToken: 'token-teste',
  telegramAllowedChatIds: ['111'],
  openrouterApiKey: 'chave-teste',
  databasePath: './data/teste.db',
  databaseEncryptionKey: 'chave-teste',
  logLevel: 'info',
  googleOAuthClient: null,
  pluggy: null,
  whatsapp: null,
};

const ENV_COM_WHATSAPP: Env = {
  ...ENV_BASE,
  whatsapp: {
    wahaUrl: 'http://waha:3000',
    wahaApiKey: 'waha-key-teste',
    wahaSession: 'default',
    destinatarios: ['5511999999999'],
  },
};

function criarBotFalso() {
  return {
    api: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      sendPhoto: vi.fn().mockResolvedValue(undefined),
      sendDocument: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as Bot;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('notificarTexto', () => {
  it('sem WhatsApp configurado: manda só por Telegram, sem chamar a API do WhatsApp', async () => {
    const bot = criarBotFalso();

    await notificarTexto(ENV_BASE, bot, ['111', '222'], 'Olá', criarLoggerSilencioso());

    expect(bot.api.sendMessage).toHaveBeenCalledTimes(2);
    expect(enviarTextoWhatsapp).not.toHaveBeenCalled();
  });

  it('com WhatsApp configurado: manda pelos dois canais', async () => {
    const bot = criarBotFalso();

    await notificarTexto(ENV_COM_WHATSAPP, bot, ['111'], 'Olá', criarLoggerSilencioso());

    expect(bot.api.sendMessage).toHaveBeenCalledWith('111', 'Olá');
    expect(enviarTextoWhatsapp).toHaveBeenCalledWith(
      { url: 'http://waha:3000', apiKey: 'waha-key-teste', session: 'default' },
      '5511999999999',
      'Olá',
    );
  });

  it('falha no envio Telegram não impede o envio WhatsApp, e não lança', async () => {
    const bot = criarBotFalso();
    vi.mocked(bot.api.sendMessage).mockRejectedValueOnce(new Error('Telegram fora do ar'));

    await expect(
      notificarTexto(ENV_COM_WHATSAPP, bot, ['111'], 'Olá', criarLoggerSilencioso()),
    ).resolves.toBeUndefined();

    expect(enviarTextoWhatsapp).toHaveBeenCalledTimes(1);
  });

  it('falha no envio WhatsApp não impede o envio Telegram, e não lança', async () => {
    const bot = criarBotFalso();
    vi.mocked(enviarTextoWhatsapp).mockRejectedValueOnce(new Error('sessão desconectada'));

    await expect(
      notificarTexto(ENV_COM_WHATSAPP, bot, ['111'], 'Olá', criarLoggerSilencioso()),
    ).resolves.toBeUndefined();

    expect(bot.api.sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('notificarImagem', () => {
  it('com WhatsApp configurado: manda pelos dois canais, com legenda', async () => {
    const bot = criarBotFalso();
    const imagem = Buffer.from('fake-png');

    await notificarImagem(ENV_COM_WHATSAPP, bot, ['111'], imagem, criarLoggerSilencioso(), 'legenda');

    expect(bot.api.sendPhoto).toHaveBeenCalledWith('111', expect.anything(), { caption: 'legenda' });
    expect(enviarImagemWhatsapp).toHaveBeenCalledWith(
      { url: 'http://waha:3000', apiKey: 'waha-key-teste', session: 'default' },
      '5511999999999',
      imagem,
      'legenda',
    );
  });
});

describe('notificarDocumento', () => {
  it('com WhatsApp configurado: manda pelos dois canais', async () => {
    const bot = criarBotFalso();
    const documento = Buffer.from('fake-pdf');

    await notificarDocumento(ENV_COM_WHATSAPP, bot, ['111'], documento, 'relatorio.pdf', criarLoggerSilencioso());

    expect(bot.api.sendDocument).toHaveBeenCalledWith('111', expect.anything());
    expect(enviarDocumentoWhatsapp).toHaveBeenCalledWith(
      { url: 'http://waha:3000', apiKey: 'waha-key-teste', session: 'default' },
      '5511999999999',
      documento,
      'relatorio.pdf',
    );
  });

  it('sem WhatsApp configurado: manda só por Telegram', async () => {
    const bot = criarBotFalso();

    await notificarDocumento(ENV_BASE, bot, ['111'], Buffer.from('x'), 'a.pdf', criarLoggerSilencioso());

    expect(bot.api.sendDocument).toHaveBeenCalledTimes(1);
    expect(enviarDocumentoWhatsapp).not.toHaveBeenCalled();
  });
});
