import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Bot } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarLembreteReautorizacaoGoogle } from '../../src/bot/lembreteReautorizacaoGoogle.js';
import { obterPendenciaOAuthGoogle, removerPendenciaOAuthGoogle } from '../../src/bot/googleOAuthPendencia.js';
import type { Env } from '../../src/config/env.js';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { definirIdioma } from '../../src/db/repositories/idiomaBot.js';
import { obterUltimoEnvio, registrarEnvio } from '../../src/db/repositories/lembreteReautorizacaoGoogle.js';
import { createLogger } from '../../src/logging/logger.js';

const logger = createLogger(undefined, 'fatal');
const INTERVALO_MS = 5 * 24 * 60 * 60 * 1000;

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-lembrete-reautorizacao-bot-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma("key='chave-teste-lembrete-reautorizacao-bot'");
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
  removerPendenciaOAuthGoogle(7001);
  removerPendenciaOAuthGoogle(7002);
  vi.useRealTimers();
});

const ENV_BASE: Env = {
  ambiente: 'homologacao',
  telegramBotToken: 'token',
  telegramAllowedChatIds: ['7001'],
  openrouterApiKey: 'chave',
  databasePath: './data/teste.db',
  databaseEncryptionKey: 'chave-cifragem',
  logLevel: 'info',
  googleOAuthClient: null,
  pluggy: null,
};

function criarBotFake() {
  const sendMessage = vi.fn(async () => ({}));
  return { api: { sendMessage } } as unknown as Bot & { api: { sendMessage: typeof sendMessage } };
}

describe('iniciarLembreteReautorizacaoGoogle', () => {
  it('sem googleOAuthClient, nada agenda (sendMessage nunca é chamado)', async () => {
    vi.useFakeTimers();
    const bot = criarBotFake();

    iniciarLembreteReautorizacaoGoogle(bot, ENV_BASE, db, logger);
    await vi.advanceTimersByTimeAsync(INTERVALO_MS * 2);

    expect(bot.api.sendMessage).not.toHaveBeenCalled();
  });

  it('sem envio registrado ainda, não manda antes de 5 dias e manda exatamente aos 5 dias', async () => {
    vi.useFakeTimers();
    const bot = criarBotFake();
    const env: Env = { ...ENV_BASE, googleOAuthClient: { clientId: 'id', clientSecret: 'secret', calendarId: 'primary' } };

    iniciarLembreteReautorizacaoGoogle(bot, env, db, logger);

    await vi.advanceTimersByTimeAsync(INTERVALO_MS - 1);
    expect(bot.api.sendMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(bot.api.sendMessage).toHaveBeenCalledTimes(1);
    expect(bot.api.sendMessage.mock.calls[0]?.[0]).toBe(7001);
    expect(bot.api.sendMessage.mock.calls[0]?.[1] as string).toContain('Lembrete automático');
  });

  it('com idioma en ativo, manda o lembrete em inglês', async () => {
    definirIdioma(db, 'en');
    vi.useFakeTimers();
    const bot = criarBotFake();
    const env: Env = { ...ENV_BASE, googleOAuthClient: { clientId: 'id', clientSecret: 'secret', calendarId: 'primary' } };

    iniciarLembreteReautorizacaoGoogle(bot, env, db, logger);
    await vi.advanceTimersByTimeAsync(INTERVALO_MS);

    expect(bot.api.sendMessage.mock.calls[0]?.[1] as string).toContain('Automatic reminder');
  });

  it('com envio já vencido (mais de 5 dias no passado), manda assim que o processo sobe', async () => {
    vi.useFakeTimers();
    registrarEnvio(db);
    vi.advanceTimersByTime(INTERVALO_MS + 60_000);

    const bot = criarBotFake();
    const env: Env = { ...ENV_BASE, googleOAuthClient: { clientId: 'id', clientSecret: 'secret', calendarId: 'primary' } };

    iniciarLembreteReautorizacaoGoogle(bot, env, db, logger);
    await vi.advanceTimersByTimeAsync(0);

    expect(bot.api.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('depois de mandar, registra o envio e reagenda o próximo ciclo pra +5 dias', async () => {
    vi.useFakeTimers();
    const bot = criarBotFake();
    const env: Env = { ...ENV_BASE, googleOAuthClient: { clientId: 'id', clientSecret: 'secret', calendarId: 'primary' } };

    iniciarLembreteReautorizacaoGoogle(bot, env, db, logger);
    await vi.advanceTimersByTimeAsync(INTERVALO_MS);

    expect(bot.api.sendMessage).toHaveBeenCalledTimes(1);
    expect(obterUltimoEnvio(db)).not.toBeNull();

    await vi.advanceTimersByTimeAsync(INTERVALO_MS - 1);
    expect(bot.api.sendMessage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(bot.api.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('falha ao mandar pra um chat não impede o envio pros outros', async () => {
    vi.useFakeTimers();
    const bot = criarBotFake();
    bot.api.sendMessage.mockRejectedValueOnce(new Error('falhou'));
    const env: Env = {
      ...ENV_BASE,
      telegramAllowedChatIds: ['7001', '7002'],
      googleOAuthClient: { clientId: 'id', clientSecret: 'secret', calendarId: 'primary' },
    };

    iniciarLembreteReautorizacaoGoogle(bot, env, db, logger);
    await vi.advanceTimersByTimeAsync(INTERVALO_MS);

    expect(bot.api.sendMessage).toHaveBeenCalledTimes(2);
    expect(bot.api.sendMessage.mock.calls.map((c) => c[0])).toEqual([7001, 7002]);
  });

  it('gera uma pendência OAuth real pro chat, igual ao /registrar_email manual', async () => {
    vi.useFakeTimers();
    const bot = criarBotFake();
    const env: Env = { ...ENV_BASE, googleOAuthClient: { clientId: 'id', clientSecret: 'secret', calendarId: 'primary' } };

    iniciarLembreteReautorizacaoGoogle(bot, env, db, logger);
    await vi.advanceTimersByTimeAsync(INTERVALO_MS);

    expect(obterPendenciaOAuthGoogle(7001)).toBeDefined();
  });
});
