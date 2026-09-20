import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/integracoes/pluggy/cliente.js', () => ({
  autenticar: vi.fn(),
  gerarConnectToken: vi.fn(),
}));

const { autenticar, gerarConnectToken } = await import('../../src/integracoes/pluggy/cliente.js');
const { gerarEImprimirConnectToken } = await import('../../src/scripts/gerarConnectTokenPluggy.js');

afterEach(() => {
  vi.clearAllMocks();
});

describe('gerarEImprimirConnectToken', () => {
  it('sem PLUGGY_CLIENT_ID/SECRET, lança erro claro sem chamar a API', async () => {
    await expect(gerarEImprimirConnectToken(undefined, undefined)).rejects.toThrow(
      /PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET/,
    );
    expect(autenticar).not.toHaveBeenCalled();
  });

  it('só um dos dois definido, lança erro claro', async () => {
    await expect(gerarEImprimirConnectToken('id-teste', undefined)).rejects.toThrow(
      /PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET/,
    );
  });

  it('com os dois definidos, autentica e devolve o connect token', async () => {
    vi.mocked(autenticar).mockResolvedValue('api-key-teste');
    vi.mocked(gerarConnectToken).mockResolvedValue('connect-token-teste');

    const token = await gerarEImprimirConnectToken('id-teste', 'secret-teste');

    expect(autenticar).toHaveBeenCalledWith('id-teste', 'secret-teste');
    expect(gerarConnectToken).toHaveBeenCalledWith('api-key-teste');
    expect(token).toBe('connect-token-teste');
  });
});
