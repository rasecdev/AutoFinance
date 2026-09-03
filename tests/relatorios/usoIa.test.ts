import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { atualizarAvaliacaoInteracao, registrarInteracaoIa } from '../../src/db/repositories/interacoesIa.js';
import { registrarSnapshotModelo } from '../../src/db/repositories/modelosOpenrouterHistorico.js';
import { criarModeloReferencia } from '../../src/db/repositories/modelosReferenciaComparacao.js';
import { registrarUsoTokens } from '../../src/db/repositories/usoTokens.js';
import { agregarUsoIaPeriodo } from '../../src/relatorios/usoIa.js';

const CHAVE_TESTE = 'chave-teste-relatorios-uso-ia';

let dir: string;
let db: DbClient;

function hoje(): { inicio: string; fim: string } {
  const iso = new Date().toISOString().slice(0, 10);
  return { inicio: iso, fim: iso };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-relatorios-uso-ia-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('agregarUsoIaPeriodo', () => {
  it('retorna zerado quando não há uso no período', () => {
    const resultado = agregarUsoIaPeriodo(db, hoje());

    expect(resultado.totalTokensPrompt).toBe(0);
    expect(resultado.totalTokensCompletion).toBe(0);
    expect(resultado.totalCustoEstimado).toBe(0);
    expect(resultado.porFluxoModelo).toEqual([]);
    expect(resultado.interacoesIncorretas).toBe(0);
    expect(resultado.metrica1).toEqual([]);
  });

  it('soma tokens/custo por fluxo e modelo, só origem uso_real', () => {
    registrarUsoTokens(db, {
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      tokensPrompt: 100,
      tokensCompletion: 20,
      custoEstimado: 0.01,
      origem: 'uso_real',
    });
    registrarUsoTokens(db, {
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      tokensPrompt: 50,
      tokensCompletion: 10,
      custoEstimado: 0.005,
      origem: 'uso_real',
    });
    registrarUsoTokens(db, {
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      tokensPrompt: 999,
      tokensCompletion: 999,
      custoEstimado: 999,
      origem: 'benchmark_interno',
    });

    const resultado = agregarUsoIaPeriodo(db, hoje());

    expect(resultado.totalTokensPrompt).toBe(150);
    expect(resultado.totalTokensCompletion).toBe(30);
    expect(resultado.totalCustoEstimado).toBeCloseTo(0.015);
    expect(resultado.porFluxoModelo).toEqual([
      {
        fluxo: 'conversa_texto',
        modelo: 'openai/gpt-4o-mini',
        tokensPrompt: 150,
        tokensCompletion: 30,
        custoEstimado: expect.closeTo(0.015, 5),
      },
    ]);
  });

  it('conta interações incorretas do período', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-1',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      resultado: 'sucesso',
    });
    atualizarAvaliacaoInteracao(db, 'trace-1', 'incorreto');

    expect(agregarUsoIaPeriodo(db, hoje()).interacoesIncorretas).toBe(1);
  });

  it('calcula a Métrica 1 usando o snapshot mais recente do modelo de referência', () => {
    registrarUsoTokens(db, {
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      tokensPrompt: 1000,
      tokensCompletion: 500,
      custoEstimado: 0.01,
      origem: 'uso_real',
    });
    criarModeloReferencia(db, 'Claude Haiku', 'anthropic/claude-haiku-4.5');
    registrarSnapshotModelo(db, {
      modelo: 'anthropic/claude-haiku-4.5',
      precoPrompt: 0.000001,
      precoCompletion: 0.000005,
    });

    const resultado = agregarUsoIaPeriodo(db, hoje());

    expect(resultado.metrica1).toEqual([
      {
        nomeExibicao: 'Claude Haiku',
        modelo: 'anthropic/claude-haiku-4.5',
        custoEstimado: 1000 * 0.000001 + 500 * 0.000005,
      },
    ]);
  });

  it('Métrica 1 fica vazia quando não há modelo de referência cadastrado', () => {
    registrarUsoTokens(db, {
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      tokensPrompt: 1000,
      tokensCompletion: 500,
      custoEstimado: 0.01,
      origem: 'uso_real',
    });

    expect(agregarUsoIaPeriodo(db, hoje()).metrica1).toEqual([]);
  });

  it('Métrica 1 ignora modelo de referência sem snapshot de preço', () => {
    registrarUsoTokens(db, {
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      tokensPrompt: 1000,
      tokensCompletion: 500,
      custoEstimado: 0.01,
      origem: 'uso_real',
    });
    criarModeloReferencia(db, 'Claude Haiku', 'anthropic/claude-haiku-4.5');

    expect(agregarUsoIaPeriodo(db, hoje()).metrica1).toEqual([]);
  });
});
