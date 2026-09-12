import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MODELO_ANALISAR_QUALIDADE,
  gerarAnaliseQualidade,
  resolverModeloAnalisarQualidade,
} from '../../src/ai/analisarQualidade.js';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { definirRoteamento } from '../../src/db/repositories/roteamentoTarefas.js';
import type { AgregacaoQualidade } from '../../src/relatorios/qualidade.js';

const CHAVE_TESTE = 'chave-teste-analisar-qualidade';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-analisar-qualidade-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function criarClienteFalso(analiseTexto: string, custo = 0) {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: analiseTexto } }],
    usage: { prompt_tokens: 60, completion_tokens: 25, cost: custo },
  });
  return { client: { chat: { completions: { create } } } as unknown as OpenAI, create };
}

const qualidadeVazia: AgregacaoQualidade = {
  porFluxoModelo: [],
  erroPorContexto: [],
  totalInteracoes: 0,
  totalIncorretas: 0,
  totalErrosTecnicos: 0,
};

describe('gerarAnaliseQualidade', () => {
  it('envia os dados pré-calculados no prompt e devolve o texto narrado pelo modelo', async () => {
    const { client, create } = criarClienteFalso(
      'O fluxo conversa_texto teve a maior taxa de correção manual este mês.',
      0.00015,
    );

    const resultado = await gerarAnaliseQualidade(client, {
      inicio: '2026-09-01',
      fim: '2026-09-30',
      atual: {
        porFluxoModelo: [{ fluxo: 'conversa_texto', modelo: 'openai/gpt-4o-mini', total: 10, incorretas: 3 }],
        erroPorContexto: [{ contexto: 'backup', total: 2 }],
        totalInteracoes: 10,
        totalIncorretas: 3,
        totalErrosTecnicos: 2,
      },
      anterior: qualidadeVazia,
    });

    expect(resultado).toEqual({
      analiseTexto: 'O fluxo conversa_texto teve a maior taxa de correção manual este mês.',
      tokensPrompt: 60,
      tokensCompletion: 25,
      custoReal: 0.00015,
    });

    const mensagensEnviadas = create.mock.calls[0]?.[0]?.messages;
    expect(mensagensEnviadas[0].content).toContain('nunca some, subtraia');
    expect(mensagensEnviadas[1].content).toContain('"fluxo": "conversa_texto"');
    expect(create.mock.calls[0]?.[0]?.model).toBe(MODELO_ANALISAR_QUALIDADE);
  });

  it('usa o modelo passado explicitamente em vez do padrão', async () => {
    const { client, create } = criarClienteFalso('analise');

    await gerarAnaliseQualidade(
      client,
      { inicio: '2026-09-01', fim: '2026-09-30', atual: qualidadeVazia, anterior: qualidadeVazia },
      'deepseek/deepseek-v4-flash',
    );

    expect(create.mock.calls[0]?.[0]?.model).toBe('deepseek/deepseek-v4-flash');
  });
});

describe('resolverModeloAnalisarQualidade', () => {
  it('usa o roteamento configurado quando existe linha pro fluxo', () => {
    definirRoteamento(db, 'analisar_qualidade', 'deepseek/deepseek-v4-flash');

    expect(resolverModeloAnalisarQualidade(db)).toBe('deepseek/deepseek-v4-flash');
  });

  it('cai no fallback quando não há roteamento configurado', () => {
    expect(resolverModeloAnalisarQualidade(db)).toBe(MODELO_ANALISAR_QUALIDADE);
  });
});
