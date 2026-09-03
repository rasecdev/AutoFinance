import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executarBenchmarkFluxo } from '../../src/ai/benchmark.js';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { criarCasoTeste } from '../../src/db/repositories/casosTesteBenchmark.js';

const CHAVE_TESTE = 'chave-teste-benchmark';
const FLUXO = 'conversa_texto';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-benchmark-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function respostaComToolCalls(
  toolCalls: Array<{ nome: string; argumentos: unknown }>,
  usage: { prompt_tokens: number; completion_tokens: number; cost: number } = {
    prompt_tokens: 100,
    completion_tokens: 20,
    cost: 0.0001,
  },
) {
  return {
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
    usage,
  };
}

function criarClienteFalso(...respostas: unknown[]) {
  const create = vi.fn();
  for (const resposta of respostas) {
    create.mockImplementationOnce(async () => resposta);
  }
  return { client: { chat: { completions: { create } } } as unknown as OpenAI, create };
}

function lerUsoTokens() {
  return db.prepare('SELECT * FROM uso_tokens').all() as Array<Record<string, unknown>>;
}

describe('executarBenchmarkFluxo', () => {
  it('conta acerto quando tool_calls do candidato bate exatamente com saida_esperada', async () => {
    criarCasoTeste(db, {
      fluxo: FLUXO,
      entrada: 'registra 30 reais de uber em transporte',
      saidaEsperada: [{ nome: 'registrar_transacao', argumentos: { valor: 30, categoria: 'transporte' } }],
      origem: 'curado',
    });
    const { client } = criarClienteFalso(
      respostaComToolCalls([{ nome: 'registrar_transacao', argumentos: { valor: 30, categoria: 'transporte' } }]),
    );

    const resultados = await executarBenchmarkFluxo(client, db, FLUXO, ['openai/gpt-4o-mini']);

    expect(resultados).toEqual([
      { modelo: 'openai/gpt-4o-mini', totalCasos: 1, acertos: 1, acuracia: 1, custoTotal: 0.0001 },
    ]);
  });

  it('não conta acerto quando o candidato chama a ferramenta errada', async () => {
    criarCasoTeste(db, {
      fluxo: FLUXO,
      entrada: 'registra 30 reais de uber',
      saidaEsperada: [{ nome: 'registrar_transacao', argumentos: { valor: 30 } }],
      origem: 'curado',
    });
    const { client } = criarClienteFalso(respostaComToolCalls([{ nome: 'consultar_saldo', argumentos: {} }]));

    const resultados = await executarBenchmarkFluxo(client, db, FLUXO, ['openai/gpt-4o-mini']);

    expect(resultados[0]).toMatchObject({ acertos: 0, acuracia: 0 });
  });

  it('não conta acerto quando o parâmetro está errado', async () => {
    criarCasoTeste(db, {
      fluxo: FLUXO,
      entrada: 'registra 30 reais de uber',
      saidaEsperada: [{ nome: 'registrar_transacao', argumentos: { valor: 30 } }],
      origem: 'curado',
    });
    const { client } = criarClienteFalso(
      respostaComToolCalls([{ nome: 'registrar_transacao', argumentos: { valor: 999 } }]),
    );

    const resultados = await executarBenchmarkFluxo(client, db, FLUXO, ['openai/gpt-4o-mini']);

    expect(resultados[0]).toMatchObject({ acertos: 0, acuracia: 0 });
  });

  it('conta acerto mesmo com as chaves de argumentos em ordem diferente', async () => {
    criarCasoTeste(db, {
      fluxo: FLUXO,
      entrada: 'registra 30 reais de uber em transporte',
      saidaEsperada: [{ nome: 'registrar_transacao', argumentos: { valor: 30, categoria: 'transporte' } }],
      origem: 'curado',
    });
    const { client } = criarClienteFalso(
      respostaComToolCalls([{ nome: 'registrar_transacao', argumentos: { categoria: 'transporte', valor: 30 } }]),
    );

    const resultados = await executarBenchmarkFluxo(client, db, FLUXO, ['openai/gpt-4o-mini']);

    expect(resultados[0]).toMatchObject({ acertos: 1, acuracia: 1 });
  });

  it('roda múltiplos casos e múltiplos modelos candidatos, cada um com sua própria acurácia', async () => {
    criarCasoTeste(db, {
      fluxo: FLUXO,
      entrada: 'caso 1',
      saidaEsperada: [{ nome: 'ferramenta_a', argumentos: {} }],
      origem: 'curado',
    });
    criarCasoTeste(db, {
      fluxo: FLUXO,
      entrada: 'caso 2',
      saidaEsperada: [{ nome: 'ferramenta_b', argumentos: {} }],
      origem: 'curado',
    });

    // modelo-bom: acerta os dois. modelo-ruim: acerta só o primeiro.
    const { client } = criarClienteFalso(
      respostaComToolCalls([{ nome: 'ferramenta_a', argumentos: {} }]),
      respostaComToolCalls([{ nome: 'ferramenta_b', argumentos: {} }]),
      respostaComToolCalls([{ nome: 'ferramenta_a', argumentos: {} }]),
      respostaComToolCalls([{ nome: 'ferramenta_errada', argumentos: {} }]),
    );

    const resultados = await executarBenchmarkFluxo(client, db, FLUXO, ['modelo-bom', 'modelo-ruim']);

    expect(resultados).toHaveLength(2);
    expect(resultados[0]).toMatchObject({ modelo: 'modelo-bom', acertos: 2, totalCasos: 2, acuracia: 1 });
    expect(resultados[1]).toMatchObject({ modelo: 'modelo-ruim', acertos: 1, totalCasos: 2, acuracia: 0.5 });
  });

  it('registra o custo de cada chamada em uso_tokens com origem benchmark_interno', async () => {
    criarCasoTeste(db, {
      fluxo: FLUXO,
      entrada: 'caso 1',
      saidaEsperada: [{ nome: 'ferramenta_a', argumentos: {} }],
      origem: 'curado',
    });
    const { client } = criarClienteFalso(respostaComToolCalls([{ nome: 'ferramenta_a', argumentos: {} }]));

    await executarBenchmarkFluxo(client, db, FLUXO, ['openai/gpt-4o-mini']);

    const registros = lerUsoTokens();
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      fluxo: FLUXO,
      modelo: 'openai/gpt-4o-mini',
      origem: 'benchmark_interno',
      custo_estimado: 0.0001,
    });
  });

  it('retorna resultado vazio/claro pra fluxo sem nenhum caso de teste, sem chamar a API', async () => {
    const { client, create } = criarClienteFalso();

    const resultados = await executarBenchmarkFluxo(client, db, FLUXO, ['openai/gpt-4o-mini']);

    expect(resultados).toEqual([
      { modelo: 'openai/gpt-4o-mini', totalCasos: 0, acertos: 0, acuracia: 0, custoTotal: 0 },
    ]);
    expect(create).not.toHaveBeenCalled();
  });
});
