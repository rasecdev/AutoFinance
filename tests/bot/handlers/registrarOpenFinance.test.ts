import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../../src/config/env.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarCartao } from '../../../src/db/repositories/cartoes.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { migrate } from '../../../src/db/migrate.js';
import { createLogger } from '../../../src/logging/logger.js';
import { removerPendenciaOpenFinance } from '../../../src/bot/openFinancePendencia.js';

vi.mock('../../../src/integracoes/pluggy/cliente.js', () => ({
  autenticar: vi.fn(),
  obterItem: vi.fn(),
  listarContasDoItem: vi.fn(),
}));

const { autenticar, obterItem, listarContasDoItem } = await import('../../../src/integracoes/pluggy/cliente.js');
const { createHandlerRegistrarOpenFinance, createHandlerMapeamentoOpenFinance } = await import(
  '../../../src/bot/handlers/registrarOpenFinance.js'
);

const logger = createLogger(undefined, 'fatal');

const ENV_SEM_PLUGGY: Env = {
  ambiente: 'homologacao',
  telegramBotToken: 'token',
  telegramAllowedChatIds: ['1'],
  openrouterApiKey: 'chave',
  databasePath: './data/teste.db',
  databaseEncryptionKey: 'chave-cifragem',
  logLevel: 'info',
  google: null,
  googleOAuthClient: null,
  pluggy: null,
};

const ENV_COM_PLUGGY: Env = { ...ENV_SEM_PLUGGY, pluggy: { clientId: 'id-teste', clientSecret: 'secret-teste' } };

function criarContextoFake(texto: string, chatId: number) {
  return {
    message: { text: texto },
    chat: { id: chatId },
    reply: vi.fn(async () => ({ message_id: 1 })),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

const CHAVE_TESTE = 'chave-teste-registrar-open-finance';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-registrar-open-finance-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  vi.clearAllMocks();
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
  removerPendenciaOpenFinance(7001);
  removerPendenciaOpenFinance(7002);
});

describe('handlerRegistrarOpenFinance (/registrar_open_finance)', () => {
  it('sem PLUGGY_CLIENT_ID/SECRET configurados, avisa que precisa configurar no servidor', async () => {
    const handler = createHandlerRegistrarOpenFinance(ENV_SEM_PLUGGY, logger);
    const ctx = criarContextoFake('/registrar_open_finance item-1', 7001);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('PLUGGY_CLIENT_ID'));
    expect(autenticar).not.toHaveBeenCalled();
  });

  it('sem item_id na mensagem, explica como conseguir um', async () => {
    const handler = createHandlerRegistrarOpenFinance(ENV_COM_PLUGGY, logger);
    const ctx = criarContextoFake('/registrar_open_finance', 7001);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('pluggyConnectWidget.html'));
  });

  it('falha ao autenticar com a Pluggy, avisa e não segue', async () => {
    vi.mocked(autenticar).mockRejectedValue(new Error('falha de rede'));
    const handler = createHandlerRegistrarOpenFinance(ENV_COM_PLUGGY, logger);
    const ctx = criarContextoFake('/registrar_open_finance item-1', 7001);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Não consegui autenticar'));
    expect(obterItem).not.toHaveBeenCalled();
  });

  it('item_id inexistente, avisa e não segue', async () => {
    vi.mocked(autenticar).mockResolvedValue('api-key-teste');
    vi.mocked(obterItem).mockRejectedValue(new Error('404'));
    const handler = createHandlerRegistrarOpenFinance(ENV_COM_PLUGGY, logger);
    const ctx = criarContextoFake('/registrar_open_finance item-invalido', 7001);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Não encontrei esse item_id'));
    expect(listarContasDoItem).not.toHaveBeenCalled();
  });

  it('item sem nenhuma conta, avisa', async () => {
    vi.mocked(autenticar).mockResolvedValue('api-key-teste');
    vi.mocked(obterItem).mockResolvedValue({ id: 'item-1', status: 'UPDATED' });
    vi.mocked(listarContasDoItem).mockResolvedValue([]);
    const handler = createHandlerRegistrarOpenFinance(ENV_COM_PLUGGY, logger);
    const ctx = criarContextoFake('/registrar_open_finance item-1', 7001);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('não trouxe nenhuma conta'));
  });

  it('sucesso: lista as contas encontradas e pede o mapeamento', async () => {
    vi.mocked(autenticar).mockResolvedValue('api-key-teste');
    vi.mocked(obterItem).mockResolvedValue({ id: 'item-1', status: 'UPDATED' });
    vi.mocked(listarContasDoItem).mockResolvedValue([
      { id: 'conta-pluggy-1', itemId: 'item-1', type: 'BANK', name: 'Conta Corrente', number: '1234' },
    ]);
    const handler = createHandlerRegistrarOpenFinance(ENV_COM_PLUGGY, logger);
    const ctx = criarContextoFake('/registrar_open_finance item-1', 7001);

    await handler(ctx);

    const mensagem = ctx.reply.mock.calls[0]?.[0] as string;
    expect(mensagem).toContain('Conta Corrente');
    expect(mensagem).toContain('1 =');
  });
});

describe('handlerMapeamentoOpenFinance', () => {
  it('sem pendência pro chat, não faz nada', async () => {
    const handler = createHandlerMapeamentoOpenFinance(db, logger);
    const ctx = criarContextoFake('1 = Principal', 7002);

    await handler(ctx);

    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('grava o mapeamento por conta e cartão já cadastrados, com sucesso', async () => {
    const conta = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' });
    const cartao = criarCartao(db, { contaId: conta.id, nome: 'Visa Infinity', limite: 5000, diaFechamento: 5, diaVencimento: 10 });

    vi.mocked(autenticar).mockResolvedValue('api-key-teste');
    vi.mocked(obterItem).mockResolvedValue({ id: 'item-1', status: 'UPDATED' });
    vi.mocked(listarContasDoItem).mockResolvedValue([
      { id: 'conta-pluggy-1', itemId: 'item-1', type: 'BANK', name: 'Conta Corrente' },
      { id: 'conta-pluggy-2', itemId: 'item-1', type: 'CREDIT', name: 'Cartão' },
    ]);
    const handlerComando = createHandlerRegistrarOpenFinance(ENV_COM_PLUGGY, logger);
    await handlerComando(criarContextoFake('/registrar_open_finance item-1', 7002));

    const handlerMapeamento = createHandlerMapeamentoOpenFinance(db, logger);
    const ctx = criarContextoFake('1 = Principal\n2 = Visa Infinity', 7002);
    await handlerMapeamento(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('2 conta(s) vinculada(s)'));

    const linhas = db.prepare('SELECT * FROM contas_open_finance ORDER BY pluggy_account_id').all() as Array<
      Record<string, unknown>
    >;
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({ pluggy_account_id: 'conta-pluggy-1', conta_id: conta.id, cartao_id: null });
    expect(linhas[1]).toMatchObject({ pluggy_account_id: 'conta-pluggy-2', cartao_id: cartao.id });
  });

  it('número de linhas diferente do número de contas, pede de novo', async () => {
    vi.mocked(autenticar).mockResolvedValue('api-key-teste');
    vi.mocked(obterItem).mockResolvedValue({ id: 'item-1', status: 'UPDATED' });
    vi.mocked(listarContasDoItem).mockResolvedValue([
      { id: 'conta-pluggy-1', itemId: 'item-1', type: 'BANK', name: 'Conta Corrente' },
      { id: 'conta-pluggy-2', itemId: 'item-1', type: 'CREDIT', name: 'Cartão' },
    ]);
    const handlerComando = createHandlerRegistrarOpenFinance(ENV_COM_PLUGGY, logger);
    await handlerComando(criarContextoFake('/registrar_open_finance item-1', 7002));

    const handlerMapeamento = createHandlerMapeamentoOpenFinance(db, logger);
    const ctx = criarContextoFake('1 = Principal', 7002);
    await handlerMapeamento(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('uma linha por conta'));
  });

  it('nome que não bate com conta nem cartão, avisa e não grava nada', async () => {
    criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' });

    vi.mocked(autenticar).mockResolvedValue('api-key-teste');
    vi.mocked(obterItem).mockResolvedValue({ id: 'item-1', status: 'UPDATED' });
    vi.mocked(listarContasDoItem).mockResolvedValue([
      { id: 'conta-pluggy-1', itemId: 'item-1', type: 'BANK', name: 'Conta Corrente' },
    ]);
    const handlerComando = createHandlerRegistrarOpenFinance(ENV_COM_PLUGGY, logger);
    await handlerComando(criarContextoFake('/registrar_open_finance item-1', 7002));

    const handlerMapeamento = createHandlerMapeamentoOpenFinance(db, logger);
    const ctx = criarContextoFake('1 = Inexistente', 7002);
    await handlerMapeamento(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Não encontrei conta nem cartão'));

    const linhas = db.prepare('SELECT * FROM contas_open_finance').all();
    expect(linhas).toHaveLength(0);
  });
});
