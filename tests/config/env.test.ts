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
      google: null,
      googleOAuthClient: null,
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

  it('sem nenhuma variável Google, env.google é null', () => {
    const env = loadEnv(validEnv);
    expect(env.google).toBeNull();
  });

  it('grupo Google completo sem GOOGLE_CALENDAR_ID usa default primary', () => {
    const env = loadEnv({
      ...validEnv,
      GOOGLE_CLIENT_ID: 'client-id-teste',
      GOOGLE_CLIENT_SECRET: 'client-secret-teste',
      GOOGLE_REFRESH_TOKEN: 'refresh-token-teste',
    });

    expect(env.google).toEqual({
      clientId: 'client-id-teste',
      clientSecret: 'client-secret-teste',
      refreshToken: 'refresh-token-teste',
      calendarId: 'primary',
    });
  });

  it('par cliente incompleto (só CLIENT_ID) lança erro explicando o que falta', () => {
    expect(() =>
      loadEnv({ ...validEnv, GOOGLE_CLIENT_ID: 'client-id-teste' }),
    ).toThrowError(/GOOGLE_CLIENT_SECRET/);
  });

  it('GOOGLE_REFRESH_TOKEN sozinho (sem o par cliente) lança erro', () => {
    expect(() =>
      loadEnv({ ...validEnv, GOOGLE_REFRESH_TOKEN: 'refresh-token-teste' }),
    ).toThrowError(/GOOGLE_REFRESH_TOKEN/);
  });

  it('grupo Google completo com GOOGLE_CALENDAR_ID customizado', () => {
    const env = loadEnv({
      ...validEnv,
      GOOGLE_CLIENT_ID: 'client-id-teste',
      GOOGLE_CLIENT_SECRET: 'client-secret-teste',
      GOOGLE_REFRESH_TOKEN: 'refresh-token-teste',
      GOOGLE_CALENDAR_ID: 'calendario-teste@group.calendar.google.com',
    });

    expect(env.google?.calendarId).toBe('calendario-teste@group.calendar.google.com');
  });

  it('só o par cliente (sem refresh token) é válido — google null, googleOAuthClient preenchido', () => {
    const env = loadEnv({
      ...validEnv,
      GOOGLE_CLIENT_ID: 'client-id-teste',
      GOOGLE_CLIENT_SECRET: 'client-secret-teste',
    });

    expect(env.google).toBeNull();
    expect(env.googleOAuthClient).toEqual({ clientId: 'client-id-teste', clientSecret: 'client-secret-teste' });
  });

  it('grupo completo também preenche googleOAuthClient com o mesmo par', () => {
    const env = loadEnv({
      ...validEnv,
      GOOGLE_CLIENT_ID: 'client-id-teste',
      GOOGLE_CLIENT_SECRET: 'client-secret-teste',
      GOOGLE_REFRESH_TOKEN: 'refresh-token-teste',
    });

    expect(env.googleOAuthClient).toEqual({ clientId: 'client-id-teste', clientSecret: 'client-secret-teste' });
  });
});
