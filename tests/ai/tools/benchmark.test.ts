import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarToolCriarCasoTesteBenchmark, criarToolRodarBenchmarkInterno } from '../../../src/ai/tools/benchmark.js';
import type { DbClient } from '../../../src/db/client.js';
import { migrate } from '../../../src/db/migrate.js';
import { listarBenchmarks } from '../../../src/db/repositories/benchmarksModelos.js';
import { criarCasoTeste, listarCasosTeste } from '../../../src/db/repositories/casosTesteBenchmark.js';
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

function criarClienteFalso(toolCalls: Array<{ nome: string; argumentos: unknown }>) {
  const create = vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: toolCalls.map((tc, i) => ({
            id: `call-${i}`,
            type: 'function',
            function: { name: tc.nome, arguments: JSON.stringify(tc.argumentos) },
          })),
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0002 },
  });
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

describe('tool rodar_benchmark_interno', () => {
  it('exige confirmação e avisa quantas chamadas reais serão feitas', () => {
    criarCasoTeste(db, {
      fluxo: 'conversa_texto',
      entrada: 'caso 1',
      saidaEsperada: [{ nome: 'ferramenta_a', argumentos: {} }],
      origem: 'curado',
    });
    const client = criarClienteFalso([]);
    const tool = criarToolRodarBenchmarkInterno(client, db);

    expect(tool.requerConfirmacao).toBe(true);
    const aviso = tool.avisoConfirmacao?.({
      modelos_candidatos: ['openai/gpt-4o-mini', 'qwen/qwen3-32b'],
      fluxo: 'conversa_texto',
    });

    expect(aviso).toContain('2 chamada');
    expect(aviso).toContain('minuto');
    expect(aviso).toContain('NÃO reenvie');

    const resumo = tool.resumoConfirmacao?.({
      modelos_candidatos: ['openai/gpt-4o-mini', 'qwen/qwen3-32b'],
      fluxo: 'conversa_texto',
    });
    expect(resumo).toBe(
      'rodar o benchmark interno do fluxo "conversa_texto" contra 2 modelo(s) candidato(s) (openai/gpt-4o-mini, qwen/qwen3-32b)',
    );
    expect(resumo).not.toMatch(/[{}]/);
  });

  it('sem informar fluxo, o schema aplica o default conversa_texto (compatibilidade com uso anterior a esta tarefa)', () => {
    const tool = criarToolRodarBenchmarkInterno(criarClienteFalso([]), db);

    const args = tool.schema.parse({ modelos_candidatos: ['openai/gpt-4o-mini'] });

    expect(args.fluxo).toBe('conversa_texto');
  });

  it('avisa quando não há nenhum caso de teste do fluxo pedido', () => {
    const client = criarClienteFalso([]);
    const tool = criarToolRodarBenchmarkInterno(client, db);

    const aviso = tool.avisoConfirmacao?.({ modelos_candidatos: ['openai/gpt-4o-mini'], fluxo: 'conversa_texto' });

    expect(aviso).toContain('Não há nenhum caso de teste');
    expect(aviso).toContain('conversa_texto');
  });

  it('recusa rodar (e não grava nada) mesmo se confirmado sem nenhum caso de teste', async () => {
    const client = criarClienteFalso([]);
    const tool = criarToolRodarBenchmarkInterno(client, db);

    const resposta = await tool.handler(
      { modelos_candidatos: ['openai/gpt-4o-mini'], fluxo: 'conversa_texto' },
      { chatId: 1 },
    );

    expect(resposta).toContain('Não há nenhum caso de teste');
    expect(listarBenchmarks(db, 'conversa_texto', 'openai/gpt-4o-mini')).toEqual([]);
  });

  it('roda o benchmark e grava um resultado por modelo candidato em benchmarks_modelos', async () => {
    criarCasoTeste(db, {
      fluxo: 'conversa_texto',
      entrada: 'registra 30 reais de uber',
      saidaEsperada: [{ nome: 'registrar_transacao', argumentos: { valor: 30 } }],
      origem: 'curado',
    });
    const client = criarClienteFalso([{ nome: 'registrar_transacao', argumentos: { valor: 30 } }]);
    const tool = criarToolRodarBenchmarkInterno(client, db);

    const resposta = await tool.handler(
      { modelos_candidatos: ['openai/gpt-4o-mini'], fluxo: 'conversa_texto' },
      { chatId: 1 },
    );

    expect(resposta).toContain('openai/gpt-4o-mini');
    expect(resposta).toContain('100%');
    const benchmarks = listarBenchmarks(db, 'conversa_texto', 'openai/gpt-4o-mini');
    expect(benchmarks).toEqual([
      {
        id: expect.any(Number),
        fluxo: 'conversa_texto',
        modelIdOpenrouter: 'openai/gpt-4o-mini',
        metrica: 'acuracia_tool_calling',
        valor: 1,
        fonteUrl: 'interno',
        dataPesquisa: expect.any(String),
      },
    ]);
  });

  it('grava um resultado por modelo candidato quando há mais de um', async () => {
    criarCasoTeste(db, {
      fluxo: 'conversa_texto',
      entrada: 'caso 1',
      saidaEsperada: [{ nome: 'ferramenta_a', argumentos: {} }],
      origem: 'curado',
    });
    const client = criarClienteFalso([{ nome: 'ferramenta_a', argumentos: {} }]);
    const tool = criarToolRodarBenchmarkInterno(client, db);

    await tool.handler({ modelos_candidatos: ['modelo-a', 'modelo-b'], fluxo: 'conversa_texto' }, { chatId: 1 });

    expect(listarBenchmarks(db, 'conversa_texto', 'modelo-a')).toHaveLength(1);
    expect(listarBenchmarks(db, 'conversa_texto', 'modelo-b')).toHaveLength(1);
  });

  it('roda contra o fluxo leitura_comprovante quando informado, gravando em benchmarks_modelos com esse fluxo', async () => {
    criarCasoTeste(db, {
      fluxo: 'leitura_comprovante',
      entrada: 'comprovante de teste',
      entradaArquivo: { base64: Buffer.from('%PDF-1.4 fake').toString('base64'), mimeType: 'application/pdf' },
      saidaEsperada: { valor: 45, tipoDocumento: 'compra' },
      origem: 'curado',
    });
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ eComprovante: true, tipoDocumento: 'compra', valor: 45 }) } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0002 },
    });
    const client = { chat: { completions: { create } } } as unknown as OpenAI;
    const tool = criarToolRodarBenchmarkInterno(client, db);

    const resposta = await tool.handler(
      { modelos_candidatos: ['google/gemini-2.5-flash-lite'], fluxo: 'leitura_comprovante' },
      { chatId: 1 },
    );

    expect(resposta).toContain('leitura_comprovante');
    expect(resposta).toContain('100%');
    expect(listarBenchmarks(db, 'leitura_comprovante', 'google/gemini-2.5-flash-lite')).toHaveLength(1);
    expect(listarBenchmarks(db, 'conversa_texto', 'google/gemini-2.5-flash-lite')).toEqual([]);
  });
});
