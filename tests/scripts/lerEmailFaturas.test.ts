import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Bot } from 'grammy';
import type { gmail_v1 } from 'googleapis';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../src/logging/logger.js';
import { verificarEmails } from '../../src/scripts/lerEmailFaturas.js';
import type { DbClient } from '../../src/db/client.js';
import { criarCartao } from '../../src/db/repositories/cartoes.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { criarDivida } from '../../src/db/repositories/dividas.js';
import { migrate } from '../../src/db/migrate.js';
import { obterPendenciaPersistida } from '../../src/db/repositories/confirmacoesPendentes.js';

const CHAVE_TESTE = 'chave-teste-ler-email-faturas';
const CHAT_IDS = ['111'];

let dir: string;
let db: DbClient;
let cartaoId: number;
let dividaId: number;

const logger = createLogger(undefined, 'fatal');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-ler-email-faturas-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  const contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' }).id;
  cartaoId = criarCartao(db, { contaId, nome: 'Nubank Cartão', limite: 5000, diaFechamento: 5, diaVencimento: 10 })
    .id;
  dividaId = criarDivida(db, {
    contaId,
    tipo: 'financiamento',
    valorTotal: 12000,
    numParcelas: 12,
    dataInicio: '2026-09-01',
    descricao: 'Itaú Financiamento Veículo',
  }).divida.id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function criarBotFalso(): { bot: Bot; sendMessage: ReturnType<typeof vi.fn> } {
  const sendMessage = vi.fn(async () => ({}));
  return { bot: { api: { sendMessage } } as unknown as Bot, sendMessage };
}

function criarClienteIaFalso(conteudo: string): OpenAI {
  const create = vi.fn(async () => ({
    choices: [{ message: { content: conteudo } }],
    usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001 },
  }));
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

function criarGmailFalso(mensagens: { id: string }[], payloadPorId: Record<string, gmail_v1.Schema$MessagePart>): gmail_v1.Gmail {
  const list = vi.fn(async () => ({ data: { messages: mensagens } }));
  const get = vi.fn(async ({ id }: { id: string }) => ({ data: { payload: payloadPorId[id] } }));
  const attachmentsGet = vi.fn(async () => ({ data: { data: Buffer.from('anexo-fake').toString('base64') } }));

  return {
    users: {
      messages: {
        list,
        get,
        attachments: { get: attachmentsGet },
      },
    },
  } as unknown as gmail_v1.Gmail;
}

const PAYLOAD_COM_PDF: gmail_v1.Schema$MessagePart = {
  mimeType: 'application/pdf',
  filename: 'fatura.pdf',
  body: { attachmentId: 'anexo-1', size: 1234 },
};

describe('verificarEmails', () => {
  it('e-mail já processado é ignorado, não reprocessado', async () => {
    db.prepare("INSERT INTO emails_processados (gmail_message_id, processado_em, resultado) VALUES ('msg-1', datetime('now'), 'ignorado_nao_e_fatura')").run();
    const gmail = criarGmailFalso([{ id: 'msg-1' }], { 'msg-1': PAYLOAD_COM_PDF });
    const { bot, sendMessage } = criarBotFalso();
    const client = criarClienteIaFalso(JSON.stringify({ eComprovante: false }));

    await verificarEmails(db, gmail, bot, logger, CHAT_IDS, client);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('anexo reconhecido como fatura de cartão: cria pendência e envia confirmação', async () => {
    const gmail = criarGmailFalso([{ id: 'msg-2' }], { 'msg-2': PAYLOAD_COM_PDF });
    const { bot, sendMessage } = criarBotFalso();
    const client = criarClienteIaFalso(
      JSON.stringify({
        eComprovante: true,
        tipoDocumento: 'fatura_cartao',
        valor: 850,
        data: '2026-09-15',
        identificador: 'Nubank Cartão',
      }),
    );

    await verificarEmails(db, gmail, bot, logger, CHAT_IDS, client);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[1]).toContain('CRIAR');

    const pendencia = obterPendenciaPersistida(db, Number(CHAT_IDS[0]));
    expect(pendencia?.toolName).toBe('registrar_fatura_email');
    expect((pendencia?.argumentos as { cartao_id: number }).cartao_id).toBe(cartaoId);

    const linha = db.prepare('SELECT resultado FROM emails_processados WHERE gmail_message_id = ?').get('msg-2') as {
      resultado: string;
    };
    expect(linha.resultado).toBe('pendente_confirmacao');
  });

  it('anexo reconhecido como boleto de dívida: cria pendência pra registrar_parcela_email', async () => {
    const gmail = criarGmailFalso([{ id: 'msg-3' }], { 'msg-3': PAYLOAD_COM_PDF });
    const { bot, sendMessage } = criarBotFalso();
    const client = criarClienteIaFalso(
      JSON.stringify({
        eComprovante: true,
        tipoDocumento: 'boleto_divida',
        valor: 1000,
        data: '2026-10-01',
        identificador: 'Itaú Financiamento Veículo',
      }),
    );

    await verificarEmails(db, gmail, bot, logger, CHAT_IDS, client);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const pendencia = obterPendenciaPersistida(db, Number(CHAT_IDS[0]));
    expect(pendencia?.toolName).toBe('registrar_parcela_email');
    expect((pendencia?.argumentos as { divida_id: number }).divida_id).toBe(dividaId);
  });

  it('anexo não reconhecido como fatura/boleto: marca ignorado_nao_e_fatura, sem mensagem', async () => {
    const gmail = criarGmailFalso([{ id: 'msg-4' }], { 'msg-4': PAYLOAD_COM_PDF });
    const { bot, sendMessage } = criarBotFalso();
    const client = criarClienteIaFalso(JSON.stringify({ eComprovante: false }));

    await verificarEmails(db, gmail, bot, logger, CHAT_IDS, client);

    expect(sendMessage).not.toHaveBeenCalled();
    const linha = db.prepare('SELECT resultado FROM emails_processados WHERE gmail_message_id = ?').get('msg-4') as {
      resultado: string;
    };
    expect(linha.resultado).toBe('ignorado_nao_e_fatura');
  });

  it('fatura/boleto sem identificador extraído: sem correspondência possível, sem mensagem', async () => {
    const gmail = criarGmailFalso([{ id: 'msg-5' }], { 'msg-5': PAYLOAD_COM_PDF });
    const { bot, sendMessage } = criarBotFalso();
    const client = criarClienteIaFalso(
      JSON.stringify({ eComprovante: true, tipoDocumento: 'fatura_cartao', valor: 500, data: '2026-09-15' }),
    );

    await verificarEmails(db, gmail, bot, logger, CHAT_IDS, client);

    expect(sendMessage).not.toHaveBeenCalled();
    const linha = db.prepare('SELECT resultado FROM emails_processados WHERE gmail_message_id = ?').get('msg-5') as {
      resultado: string;
    };
    expect(linha.resultado).toBe('sem_correspondencia');
  });

  it('e-mail sem anexo em formato reconhecido: ignorado_nao_e_fatura', async () => {
    const gmail = criarGmailFalso([{ id: 'msg-6' }], { 'msg-6': { mimeType: 'text/plain' } });
    const { bot, sendMessage } = criarBotFalso();
    const client = criarClienteIaFalso(JSON.stringify({ eComprovante: false }));

    await verificarEmails(db, gmail, bot, logger, CHAT_IDS, client);

    expect(sendMessage).not.toHaveBeenCalled();
    const linha = db.prepare('SELECT resultado FROM emails_processados WHERE gmail_message_id = ?').get('msg-6') as {
      resultado: string;
    };
    expect(linha.resultado).toBe('ignorado_nao_e_fatura');
  });
});
