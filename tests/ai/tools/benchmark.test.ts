import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarToolCriarCasoTesteBenchmark } from '../../../src/ai/tools/benchmark.js';
import type { DbClient } from '../../../src/db/client.js';
import { migrate } from '../../../src/db/migrate.js';
import { listarCasosTeste } from '../../../src/db/repositories/casosTesteBenchmark.js';
import { atualizarAvaliacaoInteracao, registrarInteracaoIa } from '../../../src/db/repositories/interacoesIa.js';

const CHAVE_TESTE = 'chave-teste-tools-benchmark';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tools-benchmark-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('tool criar_caso_teste_benchmark', () => {
  it('avisa quando não há nenhuma interação correta nesse chat', async () => {
    const tool = criarToolCriarCasoTesteBenchmark(db);

    const resultado = await tool.handler({}, { chatId: 100 });

    expect(resultado).toContain('Não encontrei');
    expect(listarCasosTeste(db, 'conversa_texto')).toEqual([]);
  });

  it('promove a última interação correta em caso de teste, com origem derivado_correcao', async () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-1',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'registra 30 reais de uber em transporte',
      toolCalls: [{ nome: 'registrar_transacao', argumentos: { valor: 30, categoria: 'transporte' } }],
      resultado: 'sucesso',
      chatId: 100,
    });
    atualizarAvaliacaoInteracao(db, 'trace-1', 'correto');
    const tool = criarToolCriarCasoTesteBenchmark(db);

    const resultado = await tool.handler({}, { chatId: 100 });

    expect(resultado).toContain('salvo');
    const casos = listarCasosTeste(db, 'conversa_texto');
    expect(casos).toEqual([
      {
        id: expect.any(Number),
        fluxo: 'conversa_texto',
        entrada: 'registra 30 reais de uber em transporte',
        saidaEsperada: [{ nome: 'registrar_transacao', argumentos: { valor: 30, categoria: 'transporte' } }],
        origem: 'derivado_correcao',
        criadoEm: expect.any(String),
      },
    ]);
  });

  it('promove uma interação correta sem tool_calls como caso com saida_esperada vazia', async () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-1',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'oi',
      respostaModelo: 'olá!',
      resultado: 'sucesso',
      chatId: 100,
    });
    atualizarAvaliacaoInteracao(db, 'trace-1', 'correto');
    const tool = criarToolCriarCasoTesteBenchmark(db);

    await tool.handler({}, { chatId: 100 });

    expect(listarCasosTeste(db, 'conversa_texto')[0]?.saidaEsperada).toEqual([]);
  });

  it('não mistura interação correta de chats diferentes', async () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-1',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'do chat 200',
      resultado: 'sucesso',
      chatId: 200,
    });
    atualizarAvaliacaoInteracao(db, 'trace-1', 'correto');
    const tool = criarToolCriarCasoTesteBenchmark(db);

    const resultado = await tool.handler({}, { chatId: 100 });

    expect(resultado).toContain('Não encontrei');
    expect(listarCasosTeste(db, 'conversa_texto')).toEqual([]);
  });
});
