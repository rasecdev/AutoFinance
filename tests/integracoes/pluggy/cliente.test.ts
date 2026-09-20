import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  atualizarItem,
  autenticar,
  gerarConnectToken,
  listarContasDoItem,
  listarTransacoes,
  obterItem,
} from '../../../src/integracoes/pluggy/cliente.js';

function mockarFetch(resposta: unknown, ok = true, status = 200) {
  const fetchFalso = vi.fn().mockResolvedValue({ ok, status, json: async () => resposta });
  vi.stubGlobal('fetch', fetchFalso);
  return fetchFalso;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('autenticar', () => {
  it('troca client id/secret pela API key', async () => {
    const fetchFalso = mockarFetch({ apiKey: 'api-key-teste' });

    const apiKey = await autenticar('id-teste', 'secret-teste');

    expect(apiKey).toBe('api-key-teste');
    expect(fetchFalso).toHaveBeenCalledWith(
      'https://api.pluggy.ai/auth',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ clientId: 'id-teste', clientSecret: 'secret-teste' }),
      }),
    );
  });

  it('lança erro claro quando a Pluggy responde com falha', async () => {
    mockarFetch(undefined, false, 401);

    await expect(autenticar('id-teste', 'secret-teste')).rejects.toThrow('401');
  });
});

describe('gerarConnectToken', () => {
  it('devolve o connect token usando a API key no header X-API-KEY', async () => {
    const fetchFalso = mockarFetch({ accessToken: 'connect-token-teste' });

    const token = await gerarConnectToken('api-key-teste');

    expect(token).toBe('connect-token-teste');
    expect(fetchFalso).toHaveBeenCalledWith(
      'https://api.pluggy.ai/connect_token',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-API-KEY': 'api-key-teste' }) }),
    );
  });
});

describe('obterItem', () => {
  it('busca o item por id', async () => {
    mockarFetch({ id: 'item-1', status: 'UPDATED' });

    const item = await obterItem('api-key-teste', 'item-1');

    expect(item).toEqual({ id: 'item-1', status: 'UPDATED' });
  });

  it('lança erro quando o item não existe', async () => {
    mockarFetch(undefined, false, 404);

    await expect(obterItem('api-key-teste', 'item-inexistente')).rejects.toThrow('404');
  });
});

describe('atualizarItem', () => {
  it('dispara PATCH /items/{id}', async () => {
    const fetchFalso = mockarFetch({ id: 'item-1', status: 'UPDATING' });

    const item = await atualizarItem('api-key-teste', 'item-1');

    expect(item.status).toBe('UPDATING');
    expect(fetchFalso).toHaveBeenCalledWith(
      'https://api.pluggy.ai/items/item-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});

describe('listarContasDoItem', () => {
  it('devolve as contas do item', async () => {
    mockarFetch({
      results: [{ id: 'conta-1', itemId: 'item-1', type: 'BANK', name: 'Conta Corrente' }],
      page: 1,
      totalPages: 1,
    });

    const contas = await listarContasDoItem('api-key-teste', 'item-1');

    expect(contas).toEqual([{ id: 'conta-1', itemId: 'item-1', type: 'BANK', name: 'Conta Corrente' }]);
  });
});

describe('listarTransacoes', () => {
  it('devolve as transações de uma página só', async () => {
    mockarFetch({
      results: [{ id: 'tx-1', accountId: 'conta-1', description: 'Mercado', amount: -50, date: '2026-09-01' }],
      page: 1,
      totalPages: 1,
    });

    const transacoes = await listarTransacoes('api-key-teste', 'conta-1');

    expect(transacoes).toHaveLength(1);
    expect(transacoes[0]?.id).toBe('tx-1');
  });

  it('pagina automaticamente até esgotar totalPages, sem truncar', async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ id: 'tx-1', accountId: 'c1', description: 'a', amount: 1, date: 'd' }], page: 1, totalPages: 2 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ id: 'tx-2', accountId: 'c1', description: 'b', amount: 2, date: 'd' }], page: 2, totalPages: 2 }),
      });
    vi.stubGlobal('fetch', fetchFalso);

    const transacoes = await listarTransacoes('api-key-teste', 'conta-1');

    expect(transacoes.map((t) => t.id)).toEqual(['tx-1', 'tx-2']);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it('inclui o parâmetro "from" quando uma data de referência é passada', async () => {
    const fetchFalso = mockarFetch({ results: [], page: 1, totalPages: 1 });

    await listarTransacoes('api-key-teste', 'conta-1', '2026-09-01');

    const urlChamada = fetchFalso.mock.calls[0]?.[0] as string;
    expect(urlChamada).toContain('from=2026-09-01');
  });
});
