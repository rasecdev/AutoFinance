import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/config/env.js';
import type { DependenciasWebhookWhatsapp } from '../../src/canais/webhookWhatsapp.js';
import type { DbClient } from '../../src/db/client.js';
import { eventoJaProcessado } from '../../src/db/repositories/eventosWhatsappProcessados.js';
import { migrate } from '../../src/db/migrate.js';
import { createLogger } from '../../src/logging/logger.js';

const processarMensagemTextoMock = vi.fn(async () => undefined);
vi.mock('../../src/bot/handlers/texto.js', () => ({
  processarMensagemTexto: processarMensagemTextoMock,
}));

const { processarWebhookWhatsapp } = await import('../../src/canais/webhookWhatsapp.js');

const CHAVE_TESTE = 'chave-teste-webhook-whatsapp';
const CHAVE_HMAC = 'hmac-key-teste';
const logger = createLogger(undefined, 'fatal');
const deps: DependenciasWebhookWhatsapp = { client: {} as OpenAI, tools: [] };

let dir: string;
let db: DbClient;

const envComWhatsapp: Pick<Env, 'whatsapp'> = {
  whatsapp: {
    wahaUrl: 'http://whatsapp-homologacao:3000',
    wahaApiKey: 'waha-key-teste',
    wahaSession: 'default',
    destinatarios: ['5511999999999'],
    webhookHmacKey: CHAVE_HMAC,
  },
};

const envSemWhatsapp: Pick<Env, 'whatsapp'> = { whatsapp: null };

function assinar(corpo: string, chave: string = CHAVE_HMAC): string {
  return createHmac('sha512', chave).update(corpo).digest('hex');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-webhook-whatsapp-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  processarMensagemTextoMock.mockClear();
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('processarWebhookWhatsapp', () => {
  it('env.whatsapp ausente: rejeita com 404 sem processar nada', async () => {
    const corpo = JSON.stringify({ id: 'evt-1', event: 'message' });

    const resultado = await processarWebhookWhatsapp(corpo, assinar(corpo), envSemWhatsapp, db, logger, deps);

    expect(resultado.status).toBe(404);
  });

  it('sem assinatura: rejeita com 401 sem processar nada', async () => {
    const corpo = JSON.stringify({ id: 'evt-2', event: 'message' });

    const resultado = await processarWebhookWhatsapp(corpo, undefined, envComWhatsapp, db, logger, deps);

    expect(resultado.status).toBe(401);
    expect(eventoJaProcessado(db, 'evt-2')).toBe(false);
  });

  it('assinatura inválida (chave errada): rejeita com 401 sem processar nada', async () => {
    const corpo = JSON.stringify({ id: 'evt-3', event: 'message' });

    const resultado = await processarWebhookWhatsapp(
      corpo,
      assinar(corpo, 'chave-errada'),
      envComWhatsapp,
      db,
      logger,
      deps,
    );

    expect(resultado.status).toBe(401);
    expect(eventoJaProcessado(db, 'evt-3')).toBe(false);
  });

  it('corpo que não é JSON válido: rejeita com 400', async () => {
    const corpo = 'isto não é json';

    const resultado = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(resultado.status).toBe(400);
  });

  it('evento sem id: rejeita com 400', async () => {
    const corpo = JSON.stringify({ event: 'message' });

    const resultado = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(resultado.status).toBe(400);
  });

  it('evento válido, assinatura correta, tipo desconhecido: aceita (200), marca como processado, não lança erro', async () => {
    const corpo = JSON.stringify({ id: 'evt-4', event: 'tipo_que_ninguem_trata_ainda' });

    const resultado = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(resultado.status).toBe(200);
    expect(eventoJaProcessado(db, 'evt-4')).toBe(true);
  });

  it('idempotência: o mesmo evento reentregue (webhook retry) é ignorado, sem reprocessar', async () => {
    const corpo = JSON.stringify({ id: 'evt-5', event: 'message' });

    const primeira = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);
    const segunda = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
    const linhas = db.prepare('SELECT * FROM eventos_whatsapp_processados WHERE evento_id = ?').all('evt-5');
    expect(linhas).toHaveLength(1);
  });
});

describe('processarWebhookWhatsapp — evento "message" (Tarefa 134)', () => {
  it('mensagem de número fora da allowlist: ignorada, não chama processarMensagemTexto', async () => {
    const corpo = JSON.stringify({
      id: 'msg-1',
      event: 'message',
      payload: { from: '5500000000000@c.us', body: 'oi', fromMe: false },
    });

    const resultado = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(resultado.status).toBe(200);
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('mensagem própria do bot (fromMe: true): ignorada, mesmo que o número esteja na allowlist', async () => {
    const corpo = JSON.stringify({
      id: 'msg-2',
      event: 'message',
      payload: { from: '5511999999999@c.us', body: 'oi', fromMe: true },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('mensagem com mídia: ignorada nesta rodada (resposta de "não suportado" é Tarefa 137)', async () => {
    const corpo = JSON.stringify({
      id: 'msg-3',
      event: 'message',
      payload: { from: '5511999999999@c.us', body: 'foto', fromMe: false, hasMedia: true },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('mensagem de texto de número permitido: chama processarMensagemTexto com o chatId do WhatsApp', async () => {
    const corpo = JSON.stringify({
      id: 'msg-4',
      event: 'message',
      payload: { from: '5511999999999@c.us', body: 'quanto gastei esse mês?', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarMensagemTextoMock).toHaveBeenCalledTimes(1);
    expect(processarMensagemTextoMock).toHaveBeenCalledWith(
      expect.objectContaining({ reply: expect.any(Function) }),
      db,
      deps.client,
      logger,
      deps.tools,
      'quanto gastei esse mês?',
      '5511999999999@c.us',
    );
  });

  it('allowlist compara sem exigir o sufixo "@c.us" (WHATSAPP_DESTINATARIOS guarda só dígitos)', async () => {
    const corpo = JSON.stringify({
      id: 'msg-5',
      event: 'message',
      payload: { from: '5511999999999@c.us', body: 'oi', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarMensagemTextoMock).toHaveBeenCalledTimes(1);
  });
});
