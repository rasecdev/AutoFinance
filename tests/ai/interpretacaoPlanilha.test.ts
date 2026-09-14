import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type OpenAI from 'openai';
import writeXlsxFile from 'write-excel-file/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FLUXO_INTERPRETAR_PLANILHA,
  interpretarPlanilha,
  MODELO_INTERPRETAR_PLANILHA,
  resolverModeloInterpretarPlanilha,
} from '../../src/ai/interpretacaoPlanilha.js';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { definirRoteamento } from '../../src/db/repositories/roteamentoTarefas.js';

const CHAVE_TESTE = 'chave-teste-interpretacao-planilha';

async function criarPlanilhaFake(linhas: string[][]): Promise<Buffer> {
  return writeXlsxFile(linhas).toBuffer();
}

function criarClienteFalso(conteudo: string, usage?: unknown): OpenAI {
  const create = vi.fn(async () => ({
    choices: [{ message: { content: conteudo } }],
    usage,
  }));
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

describe('interpretarPlanilha', () => {
  it('extrai as transações identificadas pela IA a partir das linhas da planilha', async () => {
    const buffer = await criarPlanilhaFake([
      ['Data', 'Histórico', 'Valor'],
      ['10/09/2026', 'Mercado Central', '-45.00'],
    ]);
    const client = criarClienteFalso(
      JSON.stringify({
        transacoes: [
          { tipo: 'despesa', valor: 45.0, categoria: 'Mercado', descricao: 'Mercado Central', data: '2026-09-10' },
        ],
      }),
      { prompt_tokens: 300, completion_tokens: 40, cost: 0.0002 },
    );

    const resultado = await interpretarPlanilha(client, buffer);

    expect(resultado.transacoes).toEqual([
      { tipo: 'despesa', valor: 45.0, categoria: 'Mercado', descricao: 'Mercado Central', data: '2026-09-10' },
    ]);
    expect(resultado.linhasTruncadas).toBe(false);
    expect(resultado.tokensPrompt).toBe(300);
    expect(resultado.tokensCompletion).toBe(40);
    expect(resultado.custoReal).toBe(0.0002);
  });

  it('planilha sem transações reconhecíveis retorna lista vazia, sem lançar exceção', async () => {
    const buffer = await criarPlanilhaFake([['Coluna A', 'Coluna B'], ['x', 'y']]);
    const client = criarClienteFalso(JSON.stringify({ transacoes: [] }));

    const resultado = await interpretarPlanilha(client, buffer);

    expect(resultado.transacoes).toEqual([]);
  });

  it('remove cercado markdown antes de parsear', async () => {
    const buffer = await criarPlanilhaFake([['Data', 'Valor']]);
    const client = criarClienteFalso('```json\n{"transacoes": []}\n```');

    const resultado = await interpretarPlanilha(client, buffer);

    expect(resultado.transacoes).toEqual([]);
  });

  it('JSON malformado retorna lista vazia sem lançar exceção', async () => {
    const buffer = await criarPlanilhaFake([['Data', 'Valor']]);
    const client = criarClienteFalso('isso não é json');

    const resultado = await interpretarPlanilha(client, buffer);

    expect(resultado.transacoes).toEqual([]);
  });

  it('JSON fora do schema (valor negativo) retorna lista vazia', async () => {
    const buffer = await criarPlanilhaFake([['Data', 'Valor']]);
    const client = criarClienteFalso(
      JSON.stringify({ transacoes: [{ tipo: 'despesa', valor: -10, categoria: 'x', data: '2026-09-10' }] }),
    );

    const resultado = await interpretarPlanilha(client, buffer);

    expect(resultado.transacoes).toEqual([]);
  });

  it('planilha maior que o limite de linhas processa só até o limite e sinaliza o corte', async () => {
    const linhas = [['Data', 'Valor'], ...Array.from({ length: 510 }, (_, i) => [`linha-${i}`, '1'])];
    const buffer = await criarPlanilhaFake(linhas);
    const create = vi.fn(async () => ({
      choices: [{ message: { content: JSON.stringify({ transacoes: [] }) } }],
    }));
    const client = { chat: { completions: { create } } } as unknown as OpenAI;

    const resultado = await interpretarPlanilha(client, buffer);

    expect(resultado.linhasTruncadas).toBe(true);
    const corpoEnviado = create.mock.calls[0]?.[0] as { messages: Array<{ content: string }> };
    const dadosEnviados = JSON.parse(corpoEnviado.messages[1]?.content ?? '{}') as { linhas: unknown[] };
    expect(dadosEnviados.linhas.length).toBe(500);
  });

  it('sem usage.cost na resposta, custoReal fica 0', async () => {
    const buffer = await criarPlanilhaFake([['Data', 'Valor']]);
    const client = criarClienteFalso(JSON.stringify({ transacoes: [] }));

    const resultado = await interpretarPlanilha(client, buffer);

    expect(resultado.custoReal).toBe(0);
  });
});

describe('resolverModeloInterpretarPlanilha', () => {
  let dir: string;
  let db: DbClient;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autofinance-interpretacao-planilha-test-'));
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
    expect(resolverModeloInterpretarPlanilha(db)).toBe(MODELO_INTERPRETAR_PLANILHA);
  });

  it('com override em roteamento_tarefas, usa o modelo definido', () => {
    definirRoteamento(db, FLUXO_INTERPRETAR_PLANILHA, 'deepseek/deepseek-v4-flash');

    expect(resolverModeloInterpretarPlanilha(db)).toBe('deepseek/deepseek-v4-flash');
  });
});
