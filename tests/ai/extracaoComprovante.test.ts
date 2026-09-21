import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extrairComprovante,
  FLUXO_LEITURA_COMPROVANTE,
  MODELO_LEITURA_COMPROVANTE,
  resolverModeloLeituraComprovante,
} from '../../src/ai/extracaoComprovante.js';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { definirRoteamento } from '../../src/db/repositories/roteamentoTarefas.js';

const CHAVE_TESTE = 'chave-teste-extracao-comprovante';

function criarClienteFalso(conteudo: string, usage?: unknown): OpenAI {
  const create = vi.fn(async () => ({
    choices: [{ message: { content: conteudo } }],
    usage,
  }));
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

describe('extrairComprovante', () => {
  it('extrai os dados de um comprovante de compra válido', async () => {
    const client = criarClienteFalso(
      JSON.stringify({
        eComprovante: true,
        tipoDocumento: 'compra',
        valor: 45.0,
        categoriaSugerida: 'Mercado',
        descricao: 'Mercado Central',
        data: '2026-09-10',
      }),
      { prompt_tokens: 500, completion_tokens: 50, cost: 0.0003 },
    );

    const { resultado, tokensPrompt, tokensCompletion, custoReal } = await extrairComprovante(
      client,
      Buffer.from('fake-imagem'),
      'image/jpeg',
    );

    expect(resultado).toEqual({
      eComprovante: true,
      tipoDocumento: 'compra',
      valor: 45.0,
      categoriaSugerida: 'Mercado',
      descricao: 'Mercado Central',
      data: '2026-09-10',
    });
    expect(tokensPrompt).toBe(500);
    expect(tokensCompletion).toBe(50);
    expect(custoReal).toBe(0.0003);
  });

  it('reconhece explicitamente uma imagem que não é comprovante', async () => {
    const client = criarClienteFalso(JSON.stringify({ eComprovante: false }));

    const { resultado } = await extrairComprovante(client, Buffer.from('fake-imagem'), 'image/jpeg');

    expect(resultado).toEqual({ eComprovante: false });
  });

  it('remove cercado markdown (```json ... ```) antes de parsear', async () => {
    const client = criarClienteFalso('```json\n{"eComprovante": false}\n```');

    const { resultado } = await extrairComprovante(client, Buffer.from('fake-imagem'), 'image/jpeg');

    expect(resultado).toEqual({ eComprovante: false });
  });

  it('JSON malformado retorna eComprovante:false sem lançar exceção, e sinaliza motivo/resposta bruta pra log', async () => {
    const client = criarClienteFalso('isso não é json');

    const { resultado, motivoFalhaFormato, respostaBruta } = await extrairComprovante(
      client,
      Buffer.from('fake-imagem'),
      'image/jpeg',
    );

    expect(resultado).toEqual({ eComprovante: false });
    expect(motivoFalhaFormato).toBe('json_invalido');
    expect(respostaBruta).toBe('isso não é json');
  });

  it('JSON válido mas fora do schema (valor negativo) retorna eComprovante:false, e sinaliza motivo/resposta bruta pra log', async () => {
    const conteudo = JSON.stringify({ eComprovante: true, valor: -10 });
    const client = criarClienteFalso(conteudo);

    const { resultado, motivoFalhaFormato, respostaBruta } = await extrairComprovante(
      client,
      Buffer.from('fake-imagem'),
      'image/jpeg',
    );

    expect(resultado).toEqual({ eComprovante: false });
    expect(motivoFalhaFormato).toBe('schema_invalido');
    expect(respostaBruta).toBe(conteudo);
  });

  it('resposta válida (mesmo eComprovante:false legítimo) não sinaliza motivoFalhaFormato', async () => {
    const client = criarClienteFalso(JSON.stringify({ eComprovante: false }));

    const { motivoFalhaFormato, respostaBruta } = await extrairComprovante(client, Buffer.from('fake-imagem'), 'image/jpeg');

    expect(motivoFalhaFormato).toBeUndefined();
    expect(respostaBruta).toBeUndefined();
  });

  it('sem usage.cost na resposta, custoReal fica 0', async () => {
    const client = criarClienteFalso(JSON.stringify({ eComprovante: false }));

    const { custoReal, tokensPrompt, tokensCompletion } = await extrairComprovante(
      client,
      Buffer.from('fake-imagem'),
      'image/jpeg',
    );

    expect(custoReal).toBe(0);
    expect(tokensPrompt).toBe(0);
    expect(tokensCompletion).toBe(0);
  });

  it('monta a chamada com content multimodal (texto + image_url em data URI) e o modelo informado', async () => {
    const create = vi.fn(async () => ({
      choices: [{ message: { content: JSON.stringify({ eComprovante: false }) } }],
    }));
    const client = { chat: { completions: { create } } } as unknown as OpenAI;

    await extrairComprovante(client, Buffer.from('fake-imagem'), 'image/png', 'google/gemini-2.0-flash-lite');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'google/gemini-2.0-flash-lite',
        messages: [
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({ type: 'text' }),
              expect.objectContaining({
                type: 'image_url',
                image_url: { url: expect.stringContaining('data:image/png;base64,') },
              }),
            ]),
          }),
        ],
      }),
    );
  });

  it('PDF monta o content type "file" (não "image_url") — content type dedicado do OpenRouter', async () => {
    const create = vi.fn(async () => ({
      choices: [{ message: { content: JSON.stringify({ eComprovante: false }) } }],
    }));
    const client = { chat: { completions: { create } } } as unknown as OpenAI;

    await extrairComprovante(client, Buffer.from('fake-pdf'), 'application/pdf');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({ type: 'text' }),
              expect.objectContaining({
                type: 'file',
                file: expect.objectContaining({
                  filename: expect.any(String),
                  file_data: expect.stringContaining('data:application/pdf;base64,'),
                }),
              }),
            ]),
          }),
        ],
      }),
    );
  });
});

describe('resolverModeloLeituraComprovante', () => {
  let dir: string;
  let db: DbClient;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autofinance-extracao-comprovante-test-'));
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
    expect(resolverModeloLeituraComprovante(db)).toBe(MODELO_LEITURA_COMPROVANTE);
  });

  it('com override em roteamento_tarefas, usa o modelo definido', () => {
    definirRoteamento(db, FLUXO_LEITURA_COMPROVANTE, 'google/gemini-2.0-flash-lite');

    expect(resolverModeloLeituraComprovante(db)).toBe('google/gemini-2.0-flash-lite');
  });
});
