import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { listarErros } from '../../src/db/repositories/errosExecucao.js';
import { migrate } from '../../src/db/migrate.js';
import { createLogger } from '../../src/logging/logger.js';

const enviarMensagem = vi.fn().mockResolvedValue(undefined);
vi.mock('grammy', () => ({
  Bot: vi.fn().mockImplementation(function BotFalso(this: {
    api: { sendMessage: typeof enviarMensagem; config: { use: () => void } };
  }) {
    this.api = { sendMessage: enviarMensagem, config: { use: vi.fn() } };
  }),
}));

const enviarTextoWhatsapp = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/canais/whatsapp.js', () => ({
  enviarTextoWhatsapp,
}));

const { tratarErroCriticoJob } = await import('../../src/scripts/tratarErroCriticoJob.js');

const CHAVE_TESTE = 'chave-teste-tratar-erro-critico-job';

let dir: string;
let db: DbClient;

function criarLoggerSilencioso() {
  return createLogger({ write() {} });
}

function hoje(): { inicio: string; fim: string } {
  const agora = new Date();
  const iso = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  return { inicio: iso, fim: iso };
}

function envFalso(chatIds: string[]) {
  return { telegramBotToken: 'token-falso', telegramAllowedChatIds: chatIds, whatsapp: null };
}

function envFalsoComWhatsapp(chatIds: string[]) {
  return {
    ...envFalso(chatIds),
    whatsapp: {
      wahaUrl: 'http://waha:3000',
      wahaApiKey: 'waha-key-teste',
      wahaSession: 'default',
      destinatarios: ['5511999999999'],
    },
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tratar-erro-critico-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  enviarMensagem.mockClear();
  enviarTextoWhatsapp.mockClear();
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('tratarErroCriticoJob', () => {
  it('grava o erro em erros_execucao com o contexto e a mensagem certos', async () => {
    await tratarErroCriticoJob(db, criarLoggerSilencioso(), 'backup', new Error('disco cheio'), envFalso(['111']));

    const erros = listarErros(db, hoje());
    expect(erros).toHaveLength(1);
    expect(erros[0]?.contexto).toBe('backup');
    expect(erros[0]?.mensagem).toBe('disco cheio');
    expect(erros[0]?.detalhes).not.toBeNull();
  });

  it('trata erro que não é instância de Error (mensagem via String(), sem detalhes)', async () => {
    await tratarErroCriticoJob(
      db,
      criarLoggerSilencioso(),
      'monitorar_precos',
      'string de erro crua',
      envFalso(['111']),
    );

    const erros = listarErros(db, hoje());
    expect(erros[0]?.mensagem).toBe('string de erro crua');
    expect(erros[0]?.detalhes).toBeNull();
  });

  it('envia alerta pra cada chat da allowlist', async () => {
    await tratarErroCriticoJob(db, criarLoggerSilencioso(), 'backup', new Error('falhou'), envFalso(['111', '222']));

    expect(enviarMensagem).toHaveBeenCalledTimes(2);
    expect(enviarMensagem).toHaveBeenCalledWith('111', expect.stringContaining('backup'));
    expect(enviarMensagem).toHaveBeenCalledWith('222', expect.stringContaining('falhou'));
  });

  it('registra o erro mesmo quando o envio pro Telegram falha, sem lançar', async () => {
    enviarMensagem.mockRejectedValueOnce(new Error('Telegram fora do ar'));

    await expect(
      tratarErroCriticoJob(db, criarLoggerSilencioso(), 'backup', new Error('falhou'), envFalso(['111', '222'])),
    ).resolves.toBeUndefined();

    expect(listarErros(db, hoje())).toHaveLength(1);
    expect(enviarMensagem).toHaveBeenCalledTimes(2);
  });

  it('com WhatsApp configurado, também manda o alerta por lá', async () => {
    await tratarErroCriticoJob(
      db,
      criarLoggerSilencioso(),
      'backup',
      new Error('falhou'),
      envFalsoComWhatsapp(['111']),
    );

    expect(enviarMensagem).toHaveBeenCalledTimes(1);
    expect(enviarTextoWhatsapp).toHaveBeenCalledTimes(1);
    expect(enviarTextoWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://waha:3000' }),
      '5511999999999',
      expect.stringContaining('backup'),
    );
  });

  it('sem WhatsApp configurado, não chama a API do WhatsApp', async () => {
    await tratarErroCriticoJob(db, criarLoggerSilencioso(), 'backup', new Error('falhou'), envFalso(['111']));

    expect(enviarTextoWhatsapp).not.toHaveBeenCalled();
  });
});
