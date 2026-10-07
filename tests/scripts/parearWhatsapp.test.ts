import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parearWhatsapp } from '../../src/scripts/parearWhatsapp.js';

function mockarFetch(
  respostas: Record<string, { ok: boolean; status?: number; json?: unknown; binario?: Buffer }>,
) {
  const fetchFalso = vi.fn().mockImplementation(async (url: string) => {
    for (const [padrao, resposta] of Object.entries(respostas)) {
      if (url.includes(padrao)) {
        return {
          ok: resposta.ok,
          status: resposta.status ?? (resposta.ok ? 200 : 500),
          json: async () => resposta.json,
          arrayBuffer: async () => resposta.binario ?? Buffer.from('qr-fake-png'),
        };
      }
    }
    throw new Error(`fetch não mockado para ${url}`);
  });
  vi.stubGlobal('fetch', fetchFalso);
  return fetchFalso;
}

// Diretório temporário do SO, não `./data/` do repositório — esse só existe
// localmente depois do primeiro `loadEnv`/migration real, e não no checkout
// limpo do CI.
const CAMINHO_TESTE = join(tmpdir(), 'qr-whatsapp-teste.png');

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(CAMINHO_TESTE, { force: true });
});

describe('parearWhatsapp', () => {
  it('sem WHATSAPP_WAHA_URL/_API_KEY/_SESSION, lança erro claro sem chamar a API', async () => {
    const fetchFalso = mockarFetch({});

    await expect(parearWhatsapp(undefined, undefined, undefined)).rejects.toThrow(
      /WHATSAPP_WAHA_URL.*WHATSAPP_WAHA_API_KEY.*WHATSAPP_WAHA_SESSION/,
    );
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('sessão ainda não existe (404): cria a sessão antes de buscar o QR', async () => {
    const fetchFalso = mockarFetch({
      '/api/sessions/default': { ok: false, status: 404 },
      '/api/sessions': { ok: true, json: { name: 'default', status: 'STARTING' } },
      '/auth/qr': { ok: true },
    });

    const caminho = await parearWhatsapp(
      'http://waha:3000',
      'api-key-teste',
      'default',
      CAMINHO_TESTE,
    );

    expect(caminho).toBe(CAMINHO_TESTE);
    expect(fetchFalso).toHaveBeenCalledWith(
      'http://waha:3000/api/sessions',
      expect.objectContaining({ method: 'POST' }),
    );
    const conteudo = await readFile(CAMINHO_TESTE);
    expect(conteudo.length).toBeGreaterThan(0);
  });

  it('sessão já existe: não cria de novo, só busca o QR (idempotente)', async () => {
    const fetchFalso = mockarFetch({
      '/api/sessions/default': { ok: true, json: { name: 'default', status: 'SCAN_QR_CODE' } },
      '/auth/qr': { ok: true },
    });

    await parearWhatsapp('http://waha:3000', 'api-key-teste', 'default', CAMINHO_TESTE);

    expect(fetchFalso).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('erro claro quando a WAHA responde com falha ao buscar o QR', async () => {
    mockarFetch({
      '/api/sessions/default': { ok: true, json: { name: 'default', status: 'WORKING' } },
      '/auth/qr': { ok: false, status: 500 },
    });

    await expect(
      parearWhatsapp('http://waha:3000', 'api-key-teste', 'default', CAMINHO_TESTE),
    ).rejects.toThrow(/500/);
  });
});
