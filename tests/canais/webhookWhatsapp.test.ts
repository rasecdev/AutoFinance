import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../../src/config/env.js';
import { processarWebhookWhatsapp } from '../../src/canais/webhookWhatsapp.js';
import type { DbClient } from '../../src/db/client.js';
import { eventoJaProcessado } from '../../src/db/repositories/eventosWhatsappProcessados.js';
import { migrate } from '../../src/db/migrate.js';
import { createLogger } from '../../src/logging/logger.js';

const CHAVE_TESTE = 'chave-teste-webhook-whatsapp';
const CHAVE_HMAC = 'hmac-key-teste';
const logger = createLogger(undefined, 'fatal');

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
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('processarWebhookWhatsapp', () => {
  it('env.whatsapp ausente: rejeita com 404 sem processar nada', async () => {
    const corpo = JSON.stringify({ id: 'evt-1', event: 'message' });

    const resultado = await processarWebhookWhatsapp(corpo, assinar(corpo), envSemWhatsapp, db, logger);

    expect(resultado.status).toBe(404);
  });

  it('sem assinatura: rejeita com 401 sem processar nada', async () => {
    const corpo = JSON.stringify({ id: 'evt-2', event: 'message' });

    const resultado = await processarWebhookWhatsapp(corpo, undefined, envComWhatsapp, db, logger);

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
    );

    expect(resultado.status).toBe(401);
    expect(eventoJaProcessado(db, 'evt-3')).toBe(false);
  });

  it('corpo que não é JSON válido: rejeita com 400', async () => {
    const corpo = 'isto não é json';

    const resultado = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger);

    expect(resultado.status).toBe(400);
  });

  it('evento sem id: rejeita com 400', async () => {
    const corpo = JSON.stringify({ event: 'message' });

    const resultado = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger);

    expect(resultado.status).toBe(400);
  });

  it('evento válido, assinatura correta, tipo desconhecido: aceita (200), marca como processado, não lança erro', async () => {
    const corpo = JSON.stringify({ id: 'evt-4', event: 'tipo_que_ninguem_trata_ainda' });

    const resultado = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger);

    expect(resultado.status).toBe(200);
    expect(eventoJaProcessado(db, 'evt-4')).toBe(true);
  });

  it('idempotência: o mesmo evento reentregue (webhook retry) é ignorado, sem reprocessar', async () => {
    const corpo = JSON.stringify({ id: 'evt-5', event: 'message' });

    const primeira = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger);
    const segunda = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger);

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
    const linhas = db.prepare('SELECT * FROM eventos_whatsapp_processados WHERE evento_id = ?').all('evt-5');
    expect(linhas).toHaveLength(1);
  });
});
