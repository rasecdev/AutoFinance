import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { registrarSnapshotModelo } from '../../src/db/repositories/modelosOpenrouterHistorico.js';
import { definirRoteamento } from '../../src/db/repositories/roteamentoTarefas.js';

const enviarMensagem = vi.fn().mockResolvedValue(undefined);
vi.mock('grammy', () => ({
  Bot: vi.fn().mockImplementation(function BotFalso(this: { api: { sendMessage: typeof enviarMensagem } }) {
    this.api = { sendMessage: enviarMensagem };
  }),
}));

const {
  buscarCatalogoOpenRouter,
  detectarOportunidades,
  enviarAlertas,
  formatarMensagemAlerta,
  paraSnapshots,
} = await import('../../src/scripts/monitorarPrecos.js');

const CHAVE_TESTE = 'chave-teste-monitorar-precos';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-monitorar-precos-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  enviarMensagem.mockClear();
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => dadosFalsos }));

    expect(await buscarCatalogoOpenRouter()).toEqual(dadosFalsos.data);
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

describe('detectarOportunidades', () => {
  it('não detecta nada quando não há roteamento definido', () => {
    registrarSnapshotModelo(db, { modelo: 'openai/gpt-4o-mini', precoPrompt: 1, precoCompletion: 1 });

    expect(detectarOportunidades(db)).toEqual([]);
  });

  it('detecta mudança de preço do modelo ativo entre dois snapshots', () => {
    definirRoteamento(db, 'conversa_texto', 'openai/gpt-4o-mini');
    registrarSnapshotModelo(db, { modelo: 'openai/gpt-4o-mini', precoPrompt: 1, precoCompletion: 1 });
    registrarSnapshotModelo(db, { modelo: 'openai/gpt-4o-mini', precoPrompt: 2, precoCompletion: 2 });

    const oportunidades = detectarOportunidades(db);

    expect(oportunidades).toEqual([
      { tipo: 'preco_mudou', fluxo: 'conversa_texto', modelo: 'openai/gpt-4o-mini', precoAntigo: 2, precoNovo: 4 },
    ]);
  });

  it('não detecta nada quando o preço não mudou entre snapshots', () => {
    definirRoteamento(db, 'conversa_texto', 'openai/gpt-4o-mini');
    registrarSnapshotModelo(db, { modelo: 'openai/gpt-4o-mini', precoPrompt: 1, precoCompletion: 1 });
    registrarSnapshotModelo(db, { modelo: 'openai/gpt-4o-mini', precoPrompt: 1, precoCompletion: 1 });

    expect(detectarOportunidades(db)).toEqual([]);
  });

  it('detecta modelo mais barato que atende os requisitos', () => {
    definirRoteamento(db, 'conversa_texto', 'openai/gpt-4o', 'tools');
    registrarSnapshotModelo(db, {
      modelo: 'openai/gpt-4o',
      precoPrompt: 5,
      precoCompletion: 5,
      capacidades: ['tools'],
    });
    registrarSnapshotModelo(db, {
      modelo: 'qwen/qwen3-32b',
      precoPrompt: 1,
      precoCompletion: 1,
      capacidades: ['tools'],
    });

    const oportunidades = detectarOportunidades(db);

    expect(oportunidades).toContainEqual({
      tipo: 'modelo_mais_barato',
      fluxo: 'conversa_texto',
      modeloAtual: 'openai/gpt-4o',
      precoAtual: 10,
      modeloCandidato: 'qwen/qwen3-32b',
      precoCandidato: 2,
    });
  });

  it('não sugere candidato que não atende os requisitos', () => {
    definirRoteamento(db, 'conversa_texto', 'openai/gpt-4o', 'tools');
    registrarSnapshotModelo(db, {
      modelo: 'openai/gpt-4o',
      precoPrompt: 5,
      precoCompletion: 5,
      capacidades: ['tools'],
    });
    registrarSnapshotModelo(db, {
      modelo: 'meta/sem-tools',
      precoPrompt: 1,
      precoCompletion: 1,
      capacidades: ['temperature'],
    });

    expect(detectarOportunidades(db)).toEqual([]);
  });

  it('não sugere candidato mais caro ou igual', () => {
    definirRoteamento(db, 'conversa_texto', 'openai/gpt-4o', 'tools');
    registrarSnapshotModelo(db, {
      modelo: 'openai/gpt-4o',
      precoPrompt: 1,
      precoCompletion: 1,
      capacidades: ['tools'],
    });
    registrarSnapshotModelo(db, {
      modelo: 'qwen/qwen3-32b',
      precoPrompt: 1,
      precoCompletion: 1,
      capacidades: ['tools'],
    });

    expect(detectarOportunidades(db)).toEqual([]);
  });

  it('não quebra quando o fluxo roteado não tem snapshot ainda', () => {
    definirRoteamento(db, 'conversa_texto', 'modelo/inexistente-no-catalogo');

    expect(detectarOportunidades(db)).toEqual([]);
  });
});

describe('formatarMensagemAlerta', () => {
  it('formata mudança de preço e candidato mais barato numa mensagem só', () => {
    const texto = formatarMensagemAlerta([
      { tipo: 'preco_mudou', fluxo: 'conversa_texto', modelo: 'openai/gpt-4o-mini', precoAntigo: 1, precoNovo: 2 },
      {
        tipo: 'modelo_mais_barato',
        fluxo: 'conversa_texto',
        modeloAtual: 'openai/gpt-4o',
        precoAtual: 10,
        modeloCandidato: 'qwen/qwen3-32b',
        precoCandidato: 2,
      },
    ]);

    expect(texto).toContain('conversa_texto');
    expect(texto).toContain('openai/gpt-4o-mini');
    expect(texto).toContain('qwen/qwen3-32b');
    expect(texto).toContain('Nenhuma troca foi feita automaticamente');
  });
});

describe('enviarAlertas', () => {
  it('envia a mensagem pra cada chat permitido', async () => {
    await enviarAlertas('token-falso', ['111', '222'], 'texto do alerta');

    expect(enviarMensagem).toHaveBeenCalledTimes(2);
    expect(enviarMensagem).toHaveBeenCalledWith('111', 'texto do alerta');
    expect(enviarMensagem).toHaveBeenCalledWith('222', 'texto do alerta');
  });
});
