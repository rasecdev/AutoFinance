import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Context } from 'grammy';
import type OpenAI from 'openai';
import writeXlsxFile from 'write-excel-file/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obterPendencia, removerPendencia } from '../../../src/bot/confirmacao.js';
import type { DbClient } from '../../../src/db/client.js';
import { migrate } from '../../../src/db/migrate.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { listarUsoTokensPeriodo } from '../../../src/db/repositories/usoTokens.js';
import { createLogger } from '../../../src/logging/logger.js';

const MIME_PLANILHA_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function xlsxParaArrayBuffer(linhas: string[][]): Promise<ArrayBuffer> {
  const buffer = await writeXlsxFile(linhas).toBuffer();
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

const processarMensagemTextoMock = vi.fn(async () => undefined);
vi.mock('../../../src/bot/handlers/texto.js', () => ({
  processarMensagemTexto: processarMensagemTextoMock,
}));

const { createHandlerMidia } = await import('../../../src/bot/handlers/midia.js');

const CHAVE_TESTE = 'chave-teste-handler-midia';
const BOT_TOKEN = 'fake-token';

let dir: string;
let db: DbClient;

function criarContextoFoto() {
  return {
    chat: { id: 123 },
    message: { photo: [{ file_id: 'abc' }] },
    getFile: vi.fn(async () => ({ file_path: 'photos/file_1.jpg' })),
    reply: vi.fn(),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

function criarContextoDocumento(mimeType: string) {
  return {
    chat: { id: 123 },
    message: { document: { file_id: 'abc', mime_type: mimeType } },
    getFile: vi.fn(async () => ({ file_path: 'documents/file_1' })),
    reply: vi.fn(),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

function criarContextoPlanilha(caption?: string) {
  return {
    chat: { id: 123 },
    message: { document: { file_id: 'abc', mime_type: MIME_PLANILHA_XLSX }, caption },
    getFile: vi.fn(async () => ({ file_path: 'documents/extrato.xlsx' })),
    reply: vi.fn(),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

function criarClienteFalso(conteudo: string, usage?: unknown) {
  return {
    chat: {
      completions: { create: vi.fn(async () => ({ choices: [{ message: { content: conteudo } }], usage })) },
    },
  } as unknown as OpenAI;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-handler-midia-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  processarMensagemTextoMock.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(4) }) as unknown as Response),
  );
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  removerPendencia(123);
});

describe('handlerMidia', () => {
  it('comprovante de compra válido monta mensagem sintética e delega pro pipeline de texto com tools ajustadas', async () => {
    const client = criarClienteFalso(
      JSON.stringify({
        eComprovante: true,
        tipoDocumento: 'compra',
        valor: 45.0,
        categoriaSugerida: 'Mercado',
        descricao: 'Mercado Central',
        data: '2026-09-10',
      }),
      { cost: 0.0002 },
    );
    const handler = createHandlerMidia(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoFoto();

    await handler(ctx);

    expect(processarMensagemTextoMock).toHaveBeenCalledTimes(1);
    const [, , , , toolsPassadas, mensagemSintetica, chatId] = processarMensagemTextoMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      unknown,
      Array<{ name: string; requerConfirmacao?: boolean }>,
      string,
      number,
    ];
    expect(mensagemSintetica).toContain('R$ 45.00');
    expect(mensagemSintetica).toContain('Mercado');
    expect(mensagemSintetica).toContain('Mercado Central');
    expect(mensagemSintetica).toContain('2026-09-10');
    expect(chatId).toBe(123);

    const registrar = toolsPassadas.find((t) => t.name === 'registrar_transacao');
    expect(registrar?.requerConfirmacao).toBe(true);

    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('registra o custo da extração em uso_tokens com fluxo leitura_comprovante', async () => {
    const client = criarClienteFalso(JSON.stringify({ eComprovante: false }), { cost: 0.0002 });
    const handler = createHandlerMidia(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoFoto();

    await handler(ctx);

    const registros = listarUsoTokensPeriodo(db, { inicio: '1970-01-01', fim: '2999-01-01' });
    expect(registros).toEqual([
      expect.objectContaining({ fluxo: 'leitura_comprovante', custoEstimado: 0.0002 }),
    ]);
  });

  it('imagem que não é comprovante responde direto, sem chamar o pipeline de texto', async () => {
    const client = criarClienteFalso(JSON.stringify({ eComprovante: false }));
    const handler = createHandlerMidia(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoFoto();

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Não consegui reconhecer'));
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('fatura de cartão responde com aviso de degradação, sem registrar nada', async () => {
    const client = criarClienteFalso(JSON.stringify({ eComprovante: true, tipoDocumento: 'fatura_cartao' }));
    const handler = createHandlerMidia(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoFoto();

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('fatura de cartão'));
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('boleto de dívida responde com aviso de degradação, sem registrar nada', async () => {
    const client = criarClienteFalso(JSON.stringify({ eComprovante: true, tipoDocumento: 'boleto_divida' }));
    const handler = createHandlerMidia(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoFoto();

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('boleto de dívida'));
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('documento com mime_type de imagem segue o mesmo caminho da foto', async () => {
    const client = criarClienteFalso(JSON.stringify({ eComprovante: true, tipoDocumento: 'compra', valor: 10 }));
    const handler = createHandlerMidia(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoDocumento('image/png');

    await handler(ctx);

    expect(processarMensagemTextoMock).toHaveBeenCalledTimes(1);
  });

  it('documento PDF aceito pelo provedor segue o mesmo fluxo de decisão da foto', async () => {
    const client = criarClienteFalso(
      JSON.stringify({ eComprovante: true, tipoDocumento: 'compra', valor: 10 }),
    );
    const handler = createHandlerMidia(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoDocumento('application/pdf');

    await handler(ctx);

    expect(processarMensagemTextoMock).toHaveBeenCalledTimes(1);
  });

  it('documento PDF rejeitado pelo provedor (erro na chamada) responde mensagem específica de PDF, não a genérica', async () => {
    const client = {
      chat: { completions: { create: vi.fn(async () => Promise.reject(new Error('formato não suportado'))) } },
    } as unknown as OpenAI;
    const handler = createHandlerMidia(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoDocumento('application/pdf');

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('Ainda não consigo ler PDF, manda como foto.');
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('documento de outro tipo (não imagem, não pdf) responde tipo não suportado', async () => {
    const client = criarClienteFalso(JSON.stringify({ eComprovante: false }));
    const handler = createHandlerMidia(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoDocumento('application/zip');

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('Esse tipo de arquivo ainda não é suportado — manda uma foto do comprovante.');
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('falha na extração responde mensagem de erro, sem propagar exceção', async () => {
    const client = {
      chat: { completions: { create: vi.fn(async () => Promise.reject(new Error('API fora'))) } },
    } as unknown as OpenAI;
    const handler = createHandlerMidia(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoFoto();

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('Não consegui processar essa imagem agora, tente de novo em instantes.');
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('planilha .xlsx com legenda de conta válida monta pendência de registro em lote e responde com resumo', async () => {
    criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        arrayBuffer: async () =>
          xlsxParaArrayBuffer([
            ['Data', 'Histórico', 'Valor'],
            ['10/09/2026', 'Mercado Central', '-45.00'],
          ]),
      }) as unknown as Response),
    );
    const client = criarClienteFalso(
      JSON.stringify({
        transacoes: [
          { tipo: 'despesa', valor: 45, categoria: 'Mercado', descricao: 'Mercado Central', data: '2026-09-10' },
        ],
      }),
      { cost: 0.0003 },
    );
    const handler = createHandlerMidia(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoPlanilha('Principal');

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('1 transações'), expect.anything());
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Confirma?'), expect.anything());

    const pendencia = obterPendencia(123);
    expect(pendencia?.tool.name).toBe('registrar_transacoes_em_lote');

    const registros = listarUsoTokensPeriodo(db, { inicio: '1970-01-01', fim: '2999-01-01' });
    expect(registros).toEqual([
      expect.objectContaining({ fluxo: 'interpretar_planilha', custoEstimado: 0.0003 }),
    ]);
  });

  it('planilha sem legenda pede pra reenviar com a legenda, sem chamar a IA', async () => {
    const create = vi.fn();
    const client = { chat: { completions: { create } } } as unknown as OpenAI;
    const handler = createHandlerMidia(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoPlanilha(undefined);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('legenda'));
    expect(create).not.toHaveBeenCalled();
    expect(obterPendencia(123)).toBeUndefined();
  });

  it('planilha com legenda que não resolve conta nem cartão pede pra reenviar com a legenda', async () => {
    const create = vi.fn();
    const client = { chat: { completions: { create } } } as unknown as OpenAI;
    const handler = createHandlerMidia(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoPlanilha('Conta Inexistente');

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('legenda'));
    expect(create).not.toHaveBeenCalled();
  });

  it('planilha sem transações reconhecidas responde explicando, sem montar pendência', async () => {
    criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        arrayBuffer: async () => xlsxParaArrayBuffer([['Coluna A', 'Coluna B'], ['x', 'y']]),
      }) as unknown as Response),
    );
    const client = criarClienteFalso(JSON.stringify({ transacoes: [] }));
    const handler = createHandlerMidia(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = criarContextoPlanilha('Principal');

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Não encontrei nenhuma transação'));
    expect(obterPendencia(123)).toBeUndefined();
  });

  it('sem chatId, não faz nada', async () => {
    const client = criarClienteFalso(JSON.stringify({ eComprovante: false }));
    const handler = createHandlerMidia(client, db, createLogger({ write() {} }), BOT_TOKEN);
    const ctx = { chat: undefined, message: { photo: [{}] }, getFile: vi.fn(), reply: vi.fn() } as unknown as Context & {
      reply: ReturnType<typeof vi.fn>;
    };

    await handler(ctx);

    expect(ctx.reply).not.toHaveBeenCalled();
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });
});
