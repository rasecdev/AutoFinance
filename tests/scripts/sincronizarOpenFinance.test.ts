import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Bot } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { criarCartao } from '../../src/db/repositories/cartoes.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { registrarMapeamentoOpenFinance } from '../../src/db/repositories/contasOpenFinance.js';
import { migrate } from '../../src/db/migrate.js';
import { createLogger } from '../../src/logging/logger.js';

vi.mock('../../src/integracoes/pluggy/cliente.js', () => ({
  autenticar: vi.fn(),
  listarTransacoes: vi.fn(),
}));

const { autenticar, listarTransacoes } = await import('../../src/integracoes/pluggy/cliente.js');
const { sincronizarOpenFinance } = await import('../../src/scripts/sincronizarOpenFinance.js');

const CHAVE_TESTE = 'chave-teste-sincronizar-open-finance';
const CHAT_IDS = ['111'];
const PLUGGY_ENV = { clientId: 'id-teste', clientSecret: 'secret-teste' };

let dir: string;
let db: DbClient;
let contaId: number;

const logger = createLogger(undefined, 'fatal');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-sincronizar-open-finance-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' }).id;
  vi.mocked(autenticar).mockResolvedValue('api-key-teste');
  vi.clearAllMocks();
  vi.mocked(autenticar).mockResolvedValue('api-key-teste');
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function criarBotFalso(): { bot: Bot; sendMessage: ReturnType<typeof vi.fn> } {
  const sendMessage = vi.fn(async () => ({}));
  return { bot: { api: { sendMessage } } as unknown as Bot, sendMessage };
}

function lerTransacoes() {
  return db.prepare('SELECT * FROM transacoes').all() as Array<Record<string, unknown>>;
}

function lerProcessadas() {
  return db.prepare('SELECT * FROM transacoes_open_finance_processadas').all() as Array<Record<string, unknown>>;
}

describe('sincronizarOpenFinance', () => {
  it('transação nova sem correspondência: cria transacao com origem open_finance e avisa nos chats', async () => {
    registrarMapeamentoOpenFinance(db, { pluggyItemId: 'item-1', pluggyAccountId: 'conta-pluggy-1', contaId });
    vi.mocked(listarTransacoes).mockResolvedValue([
      { id: 'tx-1', accountId: 'conta-pluggy-1', description: 'Mercado XYZ', amount: -50, date: '2026-09-10' },
    ]);
    const { bot, sendMessage } = criarBotFalso();

    await sincronizarOpenFinance(db, bot, logger, CHAT_IDS, PLUGGY_ENV);

    const transacoes = lerTransacoes();
    expect(transacoes).toHaveLength(1);
    expect(transacoes[0]).toMatchObject({ tipo: 'despesa', valor: 50, origem: 'open_finance', trace_id: 'open_finance:tx-1' });

    const processadas = lerProcessadas();
    expect(processadas[0]).toMatchObject({ pluggy_transaction_id: 'tx-1', resultado: 'transacao_criada' });

    expect(sendMessage).toHaveBeenCalledWith('111', expect.stringContaining('Mercado XYZ'));
  });

  it('transação já batendo com uma manual existente: não cria nova, marca correspondencia_manual', async () => {
    registrarMapeamentoOpenFinance(db, { pluggyItemId: 'item-1', pluggyAccountId: 'conta-pluggy-1', contaId });
    db.prepare(
      "INSERT INTO transacoes (conta_id, tipo, valor, categoria, data, origem) VALUES (?, 'despesa', 50, 'mercado', '2026-09-10', 'manual')",
    ).run(contaId);
    vi.mocked(listarTransacoes).mockResolvedValue([
      { id: 'tx-1', accountId: 'conta-pluggy-1', description: 'Mercado XYZ', amount: -50, date: '2026-09-10' },
    ]);
    const { bot, sendMessage } = criarBotFalso();

    await sincronizarOpenFinance(db, bot, logger, CHAT_IDS, PLUGGY_ENV);

    expect(lerTransacoes()).toHaveLength(1); // só a manual, nenhuma nova criada
    expect(lerProcessadas()[0]).toMatchObject({ resultado: 'correspondencia_manual' });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('transação batendo com pagamento de fatura já paga: não cria despesa nova, marca correspondencia_fatura_parcela', async () => {
    registrarMapeamentoOpenFinance(db, { pluggyItemId: 'item-1', pluggyAccountId: 'conta-pluggy-1', contaId });
    const cartaoId = criarCartao(db, { contaId, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 }).id;
    db.prepare(
      "INSERT INTO faturas (cartao_id, mes_referencia, valor, status, data_pagamento) VALUES (?, '2026-09', 500, 'paga', '2026-09-10')",
    ).run(cartaoId);
    vi.mocked(listarTransacoes).mockResolvedValue([
      { id: 'tx-1', accountId: 'conta-pluggy-1', description: 'Pagamento fatura Nubank', amount: -500, date: '2026-09-10' },
    ]);
    const { bot, sendMessage } = criarBotFalso();

    await sincronizarOpenFinance(db, bot, logger, CHAT_IDS, PLUGGY_ENV);

    expect(lerTransacoes()).toHaveLength(0);
    expect(lerProcessadas()[0]).toMatchObject({ resultado: 'correspondencia_fatura_parcela' });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('transação de saque: não cria transacao, marca saque_ignorado', async () => {
    registrarMapeamentoOpenFinance(db, { pluggyItemId: 'item-1', pluggyAccountId: 'conta-pluggy-1', contaId });
    vi.mocked(listarTransacoes).mockResolvedValue([
      { id: 'tx-1', accountId: 'conta-pluggy-1', description: 'Saque', amount: -200, date: '2026-09-10', operationType: 'SAQUE' },
    ]);
    const { bot, sendMessage } = criarBotFalso();

    await sincronizarOpenFinance(db, bot, logger, CHAT_IDS, PLUGGY_ENV);

    expect(lerTransacoes()).toHaveLength(0);
    expect(lerProcessadas()[0]).toMatchObject({ resultado: 'saque_ignorado' });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('transação já processada não é reprocessada num ciclo seguinte', async () => {
    registrarMapeamentoOpenFinance(db, { pluggyItemId: 'item-1', pluggyAccountId: 'conta-pluggy-1', contaId });
    vi.mocked(listarTransacoes).mockResolvedValue([
      { id: 'tx-1', accountId: 'conta-pluggy-1', description: 'Mercado', amount: -50, date: '2026-09-10' },
    ]);
    const { bot } = criarBotFalso();

    await sincronizarOpenFinance(db, bot, logger, CHAT_IDS, PLUGGY_ENV);
    await sincronizarOpenFinance(db, bot, logger, CHAT_IDS, PLUGGY_ENV);

    expect(lerTransacoes()).toHaveLength(1);
    expect(lerProcessadas()).toHaveLength(1);
  });

  it('conta Pluggy mapeada pra cartão: transação nova cria com cartao_id, não conta_id', async () => {
    const cartaoId = criarCartao(db, { contaId, nome: 'Nubank', limite: 5000, diaFechamento: 5, diaVencimento: 10 }).id;
    registrarMapeamentoOpenFinance(db, { pluggyItemId: 'item-1', pluggyAccountId: 'conta-pluggy-cartao', cartaoId });
    vi.mocked(listarTransacoes).mockResolvedValue([
      { id: 'tx-1', accountId: 'conta-pluggy-cartao', description: 'Compra online', amount: -80, date: '2026-09-10' },
    ]);
    const { bot } = criarBotFalso();

    await sincronizarOpenFinance(db, bot, logger, CHAT_IDS, PLUGGY_ENV);

    const transacoes = lerTransacoes();
    expect(transacoes[0]).toMatchObject({ cartao_id: cartaoId, conta_id: null, tipo: 'despesa' });
  });

  it('falha ao sincronizar uma conta não impede sincronizar as outras', async () => {
    registrarMapeamentoOpenFinance(db, { pluggyItemId: 'item-1', pluggyAccountId: 'conta-com-erro', contaId });
    const outraContaId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Outra' }).id;
    registrarMapeamentoOpenFinance(db, { pluggyItemId: 'item-2', pluggyAccountId: 'conta-ok', contaId: outraContaId });

    vi.mocked(listarTransacoes).mockImplementation(async (_apiKey, accountId) => {
      if (accountId === 'conta-com-erro') throw new Error('token expirado');
      return [{ id: 'tx-1', accountId: 'conta-ok', description: 'Mercado', amount: -30, date: '2026-09-10' }];
    });
    const { bot } = criarBotFalso();

    await sincronizarOpenFinance(db, bot, logger, CHAT_IDS, PLUGGY_ENV);

    expect(lerTransacoes()).toHaveLength(1);
  });
});
