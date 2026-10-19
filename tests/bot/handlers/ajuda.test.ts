import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMANDOS_BOT } from '../../../src/bot/comandos.js';
import { createHandlerAjuda, processarAjuda } from '../../../src/bot/handlers/ajuda.js';
import type { DbClient } from '../../../src/db/client.js';
import { migrate } from '../../../src/db/migrate.js';
import { definirIdioma } from '../../../src/db/repositories/idiomaBot.js';

const CHAVE_TESTE = 'chave-teste-handler-ajuda';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-handler-ajuda-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function criarContextoFake() {
  return { reply: vi.fn(async () => ({ message_id: 1 })) } as unknown as Context & {
    reply: ReturnType<typeof vi.fn>;
  };
}

describe('handlerAjuda (/ajuda)', () => {
  it('lista todos os comandos de COMANDOS_BOT (fonte única, nunca desatualiza)', async () => {
    const handler = createHandlerAjuda(db);
    const ctx = criarContextoFake();

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const mensagem = ctx.reply.mock.calls[0]?.[0] as string;
    for (const { comando } of COMANDOS_BOT) {
      expect(mensagem).toContain(`/${comando}`);
    }
  });

  it('menciona pelo menos uma categoria do que dá pra pedir conversando (idioma pt, padrão)', async () => {
    const handler = createHandlerAjuda(db);
    const ctx = criarContextoFake();

    await handler(ctx);

    const mensagem = ctx.reply.mock.calls[0]?.[0] as string;
    expect(mensagem).toContain('Dívidas e financiamentos');
    expect(mensagem).toContain('Qualidade da IA');
  });

  it('com idioma en ativo, responde em inglês', async () => {
    definirIdioma(db, 'en');
    const handler = createHandlerAjuda(db);
    const ctx = criarContextoFake();

    await handler(ctx);

    const mensagem = ctx.reply.mock.calls[0]?.[0] as string;
    expect(mensagem).toContain('Debts and loans');
    expect(mensagem).toContain('AI quality');
  });
});

describe('processarAjuda — canal whatsapp (Tarefa 143)', () => {
  it('filtra /errado e /certo (exclusivos do Telegram), mas lista /registrar_email', async () => {
    const ctx = criarContextoFake();

    await processarAjuda(ctx, db, 'whatsapp');

    const mensagem = ctx.reply.mock.calls[0]?.[0] as string;
    expect(mensagem).not.toContain('/errado');
    expect(mensagem).not.toContain('/certo');
    expect(mensagem).toContain('/registrar_email');
  });

  it('usa marcação WhatsApp (*negrito*), nunca tag HTML crua', async () => {
    const ctx = criarContextoFake();

    await processarAjuda(ctx, db, 'whatsapp');

    const mensagem = ctx.reply.mock.calls[0]?.[0] as string;
    expect(mensagem).not.toContain('<b>');
    expect(mensagem).not.toContain('</b>');
    expect(mensagem).toContain('*Comandos*');
  });

  it('canal telegram continua com tag HTML (sem regressão visual)', async () => {
    const ctx = criarContextoFake();

    await processarAjuda(ctx, db, 'telegram');

    const mensagem = ctx.reply.mock.calls[0]?.[0] as string;
    expect(mensagem).toContain('<b>Comandos</b>');
    expect(mensagem).toContain('/errado');
  });
});
