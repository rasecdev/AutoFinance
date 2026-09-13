import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { definirRoteamento } from '../../src/db/repositories/roteamentoTarefas.js';
import {
  FLUXO_TRANSCRICAO_VOZ,
  MODELO_TRANSCRICAO_VOZ,
  resolverModeloTranscricaoVoz,
  transcreverAudio,
} from '../../src/ai/transcricao.js';

const CHAVE_TESTE = 'chave-teste-transcricao';

function criarClienteFalso(resposta: { text: string; usage?: unknown }): OpenAI {
  const create = vi.fn(async () => resposta);
  return { audio: { transcriptions: { create } } } as unknown as OpenAI;
}

describe('transcreverAudio', () => {
  it('transcreve o buffer e devolve o texto + custo (usage.cost presente)', async () => {
    const client = criarClienteFalso({ text: 'registra 20 reais de uber', usage: { cost: 0.0002 } });

    const resultado = await transcreverAudio(client, Buffer.from('fake-audio'), 'voz.ogg');

    expect(resultado.texto).toBe('registra 20 reais de uber');
    expect(resultado.custoEstimado).toBe(0.0002);
  });

  it('sem usage.cost na resposta, custoEstimado fica 0 (não estoura erro)', async () => {
    const client = criarClienteFalso({ text: 'oi' });

    const resultado = await transcreverAudio(client, Buffer.from('fake-audio'), 'voz.ogg');

    expect(resultado.custoEstimado).toBe(0);
  });

  it('chama a API com o modelo informado', async () => {
    const create = vi.fn(async () => ({ text: 'oi' }));
    const client = { audio: { transcriptions: { create } } } as unknown as OpenAI;

    await transcreverAudio(client, Buffer.from('fake-audio'), 'voz.ogg', 'openai/whisper-1');

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: 'openai/whisper-1' }));
  });
});

describe('resolverModeloTranscricaoVoz', () => {
  let dir: string;
  let db: DbClient;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autofinance-transcricao-test-'));
    db = new Database(join(dir, 'teste.db'));
    db.pragma("cipher='sqlcipher'");
    db.pragma(`key='${CHAVE_TESTE}'`);
    migrate(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('sem override em roteamento_tarefas, cai no modelo padrão', () => {
    expect(resolverModeloTranscricaoVoz(db)).toBe(MODELO_TRANSCRICAO_VOZ);
  });

  it('com override em roteamento_tarefas, usa o modelo definido', () => {
    definirRoteamento(db, FLUXO_TRANSCRICAO_VOZ, 'openai/whisper-1');

    expect(resolverModeloTranscricaoVoz(db)).toBe('openai/whisper-1');
  });
});
