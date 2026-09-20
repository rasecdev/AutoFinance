import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { registrarMapeamentoOpenFinance } from '../../src/db/repositories/contasOpenFinance.js';
import { migrate } from '../../src/db/migrate.js';
import { createLogger } from '../../src/logging/logger.js';

vi.mock('../../src/integracoes/pluggy/cliente.js', () => ({
  autenticar: vi.fn(),
  atualizarItem: vi.fn(),
}));

const enviarMensagem = vi.fn().mockResolvedValue(undefined);
vi.mock('grammy', () => ({
  Bot: vi.fn().mockImplementation(function BotFalso(this: {
    api: { sendMessage: typeof enviarMensagem; config: { use: () => void } };
  }) {
    this.api = { sendMessage: enviarMensagem, config: { use: vi.fn() } };
  }),
}));

const { autenticar, atualizarItem } = await import('../../src/integracoes/pluggy/cliente.js');
const { renovarSandboxPluggy } = await import('../../src/scripts/renovarSandboxPluggy.js');

const CHAVE_TESTE = 'chave-teste-renovar-sandbox-pluggy';
const CHAT_IDS = ['111'];
const PLUGGY_ENV = { clientId: 'id-teste', clientSecret: 'secret-teste' };

let dir: string;
let db: DbClient;
let contaId: number;

const logger = createLogger(undefined, 'fatal');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-renovar-sandbox-pluggy-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' }).id;
  vi.clearAllMocks();
  vi.mocked(autenticar).mockResolvedValue('api-key-teste');
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('renovarSandboxPluggy', () => {
  it('chama PATCH /items uma vez por pluggy_item_id distinto', async () => {
    registrarMapeamentoOpenFinance(db, { pluggyItemId: 'item-1', pluggyAccountId: 'conta-1', contaId });
    registrarMapeamentoOpenFinance(db, { pluggyItemId: 'item-1', pluggyAccountId: 'conta-2', contaId });
    registrarMapeamentoOpenFinance(db, { pluggyItemId: 'item-2', pluggyAccountId: 'conta-3', contaId });
    vi.mocked(atualizarItem).mockResolvedValue({ id: 'item-1', status: 'UPDATED' });

    await renovarSandboxPluggy(db, logger, 'token-falso', CHAT_IDS, PLUGGY_ENV);

    expect(atualizarItem).toHaveBeenCalledTimes(2);
    expect(atualizarItem).toHaveBeenCalledWith('api-key-teste', 'item-1');
    expect(atualizarItem).toHaveBeenCalledWith('api-key-teste', 'item-2');
  });

  it('sem nenhum mapeamento gravado, não chama a API', async () => {
    await renovarSandboxPluggy(db, logger, 'token-falso', CHAT_IDS, PLUGGY_ENV);

    expect(atualizarItem).not.toHaveBeenCalled();
  });

  it('falha ao renovar um item não impede renovar os demais', async () => {
    registrarMapeamentoOpenFinance(db, { pluggyItemId: 'item-com-erro', pluggyAccountId: 'conta-1', contaId });
    registrarMapeamentoOpenFinance(db, { pluggyItemId: 'item-ok', pluggyAccountId: 'conta-2', contaId });
    vi.mocked(atualizarItem).mockImplementation(async (_apiKey, itemId) => {
      if (itemId === 'item-com-erro') throw new Error('item removido');
      return { id: itemId, status: 'UPDATED' };
    });

    await renovarSandboxPluggy(db, logger, 'token-falso', CHAT_IDS, PLUGGY_ENV);

    expect(atualizarItem).toHaveBeenCalledWith('api-key-teste', 'item-ok');
  });
});
