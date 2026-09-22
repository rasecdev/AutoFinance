import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { definirRoteamento } from '../../src/db/repositories/roteamentoTarefas.js';
import { criarTransacao } from '../../src/db/repositories/transacoes.js';
import { gerarRelatorioMensalCompleto } from '../../src/relatorios/relatorioMensalCompleto.js';

const CHAVE_TESTE = 'chave-teste-relatorio-mensal-completo';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-relatorio-mensal-completo-test-'));
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

describe('gerarRelatorioMensalCompleto', () => {
  it('gera um PDF válido com nome de arquivo do período, números pré-calculados no prompt', async () => {
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

    const { buffer, nomeArquivo } = await gerarRelatorioMensalCompleto(db, client, new Date(2026, 2, 20, 12, 0));

    expect(nomeArquivo).toBe('relatorio-mensal-2026-03.pdf');
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const mensagensEnviadas = create.mock.calls[0]?.[0]?.messages;
    expect(mensagensEnviadas[1].content).toContain('"totalReceita": 3000');
  });

  it('registra a chamada em interacoes_ia e uso_tokens com o fluxo relatorio_mensal', async () => {
    const { client } = criarClienteFalso('resumo gerado', 0.00033);

    await gerarRelatorioMensalCompleto(db, client, new Date(2026, 2, 20, 12, 0));

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

    await gerarRelatorioMensalCompleto(db, client, new Date(2026, 2, 20, 12, 0));

    expect(create.mock.calls[0]?.[0]?.model).toBe('qwen/qwen3-32b');
  });
});
