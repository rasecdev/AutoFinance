import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarToolAnalisarQualidade } from '../../../src/ai/tools/qualidade.js';
import type { DbClient } from '../../../src/db/client.js';
import { migrate } from '../../../src/db/migrate.js';
import { atualizarAvaliacaoInteracao, registrarInteracaoIa } from '../../../src/db/repositories/interacoesIa.js';

const CHAVE_TESTE = 'chave-teste-tools-qualidade';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tools-qualidade-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function criarClienteFalso(analiseTexto: string) {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: analiseTexto } }],
    usage: { prompt_tokens: 40, completion_tokens: 20, cost: 0.0001 },
  });
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

describe('tool analisar_qualidade', () => {
  it('agrega o período, chama a IA e retorna o texto gerado', async () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-1',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      resultado: 'sucesso',
    });
    atualizarAvaliacaoInteracao(db, 'trace-1', 'incorreto');

    const client = criarClienteFalso('O fluxo conversa_texto teve 1 correção manual este mês.');
    const tool = criarToolAnalisarQualidade(client, db);

    const resultado = await tool.handler({ periodo: 'mes' }, { chatId: 100 });

    expect(resultado).toBe('O fluxo conversa_texto teve 1 correção manual este mês.');
  });

  it('grava interacoes_ia, uso_tokens e analises_qualidade após a chamada', async () => {
    const client = criarClienteFalso('Sem dado suficiente pra análise neste período.');
    const tool = criarToolAnalisarQualidade(client, db);

    await tool.handler({ periodo: 'mes' }, { chatId: 100 });

    const interacoes = db.prepare('SELECT fluxo, resposta_modelo FROM interacoes_ia').all() as Array<{
      fluxo: string;
      resposta_modelo: string;
    }>;
    expect(interacoes).toEqual([
      { fluxo: 'analisar_qualidade', resposta_modelo: 'Sem dado suficiente pra análise neste período.' },
    ]);

    const usoTokens = db.prepare('SELECT fluxo FROM uso_tokens').all() as Array<{ fluxo: string }>;
    expect(usoTokens).toEqual([{ fluxo: 'analisar_qualidade' }]);

    const analises = db.prepare('SELECT conteudo_gerado FROM analises_qualidade').all() as Array<{
      conteudo_gerado: string;
    }>;
    expect(analises).toEqual([{ conteudo_gerado: 'Sem dado suficiente pra análise neste período.' }]);
  });
});
