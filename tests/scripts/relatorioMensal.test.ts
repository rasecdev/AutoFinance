import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarConta } from '../../src/db/repositories/contas.js';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { criarTransacao } from '../../src/db/repositories/transacoes.js';
import { definirRoteamento } from '../../src/db/repositories/roteamentoTarefas.js';
import {
  calcularProximoUltimoDiaDoMesAs23h,
  montarRelatorioMensal,
} from '../../src/scripts/relatorioMensal.js';

const CHAVE_TESTE = 'chave-teste-relatorio-mensal';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-relatorio-mensal-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function criarClienteFalso(resumoTexto: string, custo = 0) {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: resumoTexto } }],
    usage: { prompt_tokens: 80, completion_tokens: 30, cost: custo },
  });
  return { client: { chat: { completions: { create } } } as unknown as OpenAI, create };
}

function lerInteracoes() {
  return db.prepare('SELECT * FROM interacoes_ia').all() as Array<Record<string, unknown>>;
}

function lerUsoTokens() {
  return db.prepare('SELECT * FROM uso_tokens').all() as Array<Record<string, unknown>>;
}

describe('calcularProximoUltimoDiaDoMesAs23h', () => {
  it('meio do mês: calcula o último dia do próprio mês às 23h', () => {
    const resultado = calcularProximoUltimoDiaDoMesAs23h(new Date(2026, 2, 10, 10, 0)); // 10/mar/2026

    expect(resultado).toEqual(new Date(2026, 2, 31, 23, 0, 0, 0));
  });

  it('último dia do mês antes das 23h: dispara hoje às 23h', () => {
    const resultado = calcularProximoUltimoDiaDoMesAs23h(new Date(2026, 1, 28, 10, 0)); // 28/fev/2026 (não bissexto)

    expect(resultado).toEqual(new Date(2026, 1, 28, 23, 0, 0, 0));
  });

  it('último dia do mês depois das 23h: dispara no último dia do mês seguinte', () => {
    const resultado = calcularProximoUltimoDiaDoMesAs23h(new Date(2026, 1, 28, 23, 30));

    expect(resultado).toEqual(new Date(2026, 2, 31, 23, 0, 0, 0));
  });

  it('respeita virada de ano', () => {
    const resultado = calcularProximoUltimoDiaDoMesAs23h(new Date(2026, 11, 31, 23, 30)); // 31/dez depois das 23h

    expect(resultado).toEqual(new Date(2027, 0, 31, 23, 0, 0, 0));
  });
});

describe('montarRelatorioMensal', () => {
  it('inclui o relatório do mês, números pré-calculados no prompt e o resumo narrado pela IA', async () => {
    const conta = criarConta(db, { bancoNome: 'Banco Teste', tipo: 'PF', apelido: 'Carteira', saldoInicial: 0 });
    criarTransacao(db, {
      contaId: conta.id,
      tipo: 'receita',
      categoria: 'salario',
      valor: 3000,
      data: '2026-03-15',
      descricao: 'salário',
    });

    const { client, create } = criarClienteFalso('Mês positivo, receita de salário concentrada.');

    const texto = await montarRelatorioMensal(db, client, new Date(2026, 2, 20, 12, 0));

    expect(texto).toContain('2026-03-01 a 2026-03-31');
    expect(texto).toContain('Resumo do mês');
    expect(texto).toContain('Mês positivo, receita de salário concentrada.');

    const mensagensEnviadas = create.mock.calls[0]?.[0]?.messages;
    expect(mensagensEnviadas[1].content).toContain('"totalReceita": 3000');
  });

  it('registra a chamada em interacoes_ia e uso_tokens com o fluxo relatorio_mensal', async () => {
    const { client } = criarClienteFalso('resumo gerado', 0.00033);

    await montarRelatorioMensal(db, client, new Date(2026, 2, 20, 12, 0));

    const interacoes = lerInteracoes().filter((i) => i.fluxo === 'relatorio_mensal');
    expect(interacoes).toHaveLength(1);
    expect(interacoes[0]).toMatchObject({ tokens_prompt: 80, tokens_completion: 30 });

    const usoTokens = lerUsoTokens().filter((u) => u.fluxo === 'relatorio_mensal');
    expect(usoTokens).toHaveLength(1);
    expect(usoTokens[0]).toMatchObject({ custo_estimado: 0.00033 });
  });

  it('usa o modelo de roteamento_tarefas pro fluxo relatorio_mensal quando definido', async () => {
    definirRoteamento(db, 'relatorio_mensal', 'qwen/qwen3-32b');
    const { client, create } = criarClienteFalso('resumo gerado');

    await montarRelatorioMensal(db, client, new Date(2026, 2, 20, 12, 0));

    expect(create.mock.calls[0]?.[0]?.model).toBe('qwen/qwen3-32b');
  });
});
