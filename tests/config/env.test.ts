import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

const validEnv = {
  AMBIENTE: 'homologacao',
  TELEGRAM_BOT_TOKEN: 'token-teste',
  TELEGRAM_ALLOWED_CHAT_IDS: '123,456',
  OPENROUTER_API_KEY: 'chave-teste',
  DATABASE_PATH: './data/teste.db',
  DATABASE_ENCRYPTION_KEY: 'chave-cifragem-teste',
};

describe('loadEnv', () => {
  it('carrega e normaliza um ambiente válido', () => {
    const env = loadEnv(validEnv);

    expect(env).toEqual({
      ambiente: 'homologacao',
      telegramBotToken: 'token-teste',
      telegramAllowedChatIds: ['123', '456'],
      openrouterApiKey: 'chave-teste',
      databasePath: './data/teste.db',
      databaseEncryptionKey: 'chave-cifragem-teste',
      logLevel: 'info',
    });
  });

  it('aceita LOG_LEVEL customizado e válido', () => {
    const env = loadEnv({ ...validEnv, LOG_LEVEL: 'debug' });
    expect(env.logLevel).toBe('debug');
  });

  it('rejeita LOG_LEVEL inválido', () => {
    expect(() => loadEnv({ ...validEnv, LOG_LEVEL: 'verbose' })).toThrowError(/LOG_LEVEL/);
  });

  it('rejeita quando falta uma variável obrigatória', () => {
    const { TELEGRAM_BOT_TOKEN: _omitido, ...semToken } = validEnv;

    expect(() => loadEnv(semToken)).toThrowError(/TELEGRAM_BOT_TOKEN/);
  });

  it('rejeita AMBIENTE fora de producao/homologacao', () => {
    expect(() => loadEnv({ ...validEnv, AMBIENTE: 'staging' })).toThrowError();
  });
});
