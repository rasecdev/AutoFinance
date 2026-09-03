import { afterEach, describe, expect, it, vi } from 'vitest';
import { buscarCatalogoOpenRouter, paraSnapshots } from '../../src/scripts/monitorarPrecos.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buscarCatalogoOpenRouter', () => {
  it('retorna a lista de modelos quando a API responde com sucesso', async () => {
    const dadosFalsos = {
      data: [
        {
          id: 'openai/gpt-4o-mini',
          pricing: { prompt: '0.00000015', completion: '0.0000006' },
          supported_parameters: ['tools'],
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => dadosFalsos }),
    );

    const modelos = await buscarCatalogoOpenRouter();

    expect(modelos).toEqual(dadosFalsos.data);
  });

  it('lança erro quando a API responde com status de falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(buscarCatalogoOpenRouter()).rejects.toThrow('503');
  });
});

describe('paraSnapshots', () => {
  it('converte preço (string) pra número e mantém supported_parameters como capacidades', () => {
    const snapshots = paraSnapshots([
      {
        id: 'openai/gpt-4o-mini',
        pricing: { prompt: '0.00000015', completion: '0.0000006' },
        supported_parameters: ['tools', 'temperature'],
      },
    ]);

    expect(snapshots).toEqual([
      {
        modelo: 'openai/gpt-4o-mini',
        precoPrompt: 0.00000015,
        precoCompletion: 0.0000006,
        capacidades: ['tools', 'temperature'],
      },
    ]);
  });

  it('aceita modelo sem supported_parameters', () => {
    const snapshots = paraSnapshots([
      { id: 'openai/gpt-4o-mini', pricing: { prompt: '0.00000015', completion: '0.0000006' } },
    ]);

    expect(snapshots[0]?.capacidades).toBeUndefined();
  });
});
