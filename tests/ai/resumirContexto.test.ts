import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FLUXO_RESUMIR_CONTEXTO,
  LIMITE_TOKENS_JANELA,
  MODELO_RESUMO,
  resumirContexto,
  verificarGatilhoResumo,
} from '../../src/ai/resumirContexto.js';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { registrarInteracaoIa } from '../../src/db/repositories/interacoesIa.js';
import { criarResumoConversa, obterUltimoResumo } from '../../src/db/repositories/resumosConversa.js';

const CHAVE_TESTE = 'chave-teste-resumir-contexto';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-resumir-contexto-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function criarClienteFalso(resumoTexto: string) {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: resumoTexto } }],
    usage: { prompt_tokens: 50, completion_tokens: 20 },
  });
  return { client: { chat: { completions: { create } } } as unknown as OpenAI, create };
}

function lerInteracoes() {
  return db.prepare('SELECT * FROM interacoes_ia').all() as Array<Record<string, unknown>>;
}

function lerUsoTokens() {
  return db.prepare('SELECT * FROM uso_tokens').all() as Array<Record<string, unknown>>;
}

function registrarInteracaoComTokens(chatId: number, traceId: string, tokens: number) {
  registrarInteracaoIa(db, {
    traceId,
    fluxo: 'conversa_texto',
    modelo: 'openai/gpt-4o-mini',
    mensagemUsuario: `pergunta ${traceId}`,
    respostaModelo: `resposta ${traceId}`,
    resultado: 'sucesso',
    chatId,
    tokensPrompt: tokens,
    tokensCompletion: 0,
  });
}

describe('resumirContexto', () => {
  it('gera um resumo combinando o resumo anterior com as mensagens novas', async () => {
    const { client, create } = criarClienteFalso('resumo cumulativo gerado pela IA');

    const resultado = await resumirContexto(client, {
      resumoAnterior: 'usuário perguntou sobre gastos de março',
      mensagensNovas: [
        {
          id: 1,
          traceId: 'trace-1',
          fluxo: 'conversa_texto',
          modelo: 'openai/gpt-4o-mini',
          mensagemUsuario: 'e em abril?',
          respostaModelo: 'você gastou R$ 900',
          resultado: 'sucesso',
          chatId: 100,
          tokensPrompt: 10,
          tokensCompletion: 5,
          dataHora: new Date().toISOString(),
        },
      ],
    });

    expect(resultado).toEqual({
      resumoTexto: 'resumo cumulativo gerado pela IA',
      tokensPrompt: 50,
      tokensCompletion: 20,
    });

    const mensagensEnviadas = create.mock.calls[0]?.[0]?.messages;
    expect(mensagensEnviadas[1].content).toContain('usuário perguntou sobre gastos de março');
    expect(mensagensEnviadas[1].content).toContain('e em abril?');
    expect(create.mock.calls[0]?.[0]?.model).toBe(MODELO_RESUMO);
  });
});

describe('verificarGatilhoResumo', () => {
  it('não dispara resumo quando os tokens da janela estão abaixo do limite', async () => {
    const { client, create } = criarClienteFalso('não deveria ser chamado');
    registrarInteracaoComTokens(100, 'trace-1', 100);

    await verificarGatilhoResumo(db, client, 100);

    expect(create).not.toHaveBeenCalled();
    expect(obterUltimoResumo(db, 100)).toBeUndefined();
  });

  it('dispara resumo e grava resumos_conversa quando ultrapassa o limite', async () => {
    const { client } = criarClienteFalso('resumo gerado');
    registrarInteracaoComTokens(100, 'trace-1', LIMITE_TOKENS_JANELA + 1);

    await verificarGatilhoResumo(db, client, 100);

    const resumo = obterUltimoResumo(db, 100);
    expect(resumo).toMatchObject({
      chatId: 100,
      resumoTexto: 'resumo gerado',
      cobreAteTraceId: 'trace-1',
      tokensJanelaNoGatilho: LIMITE_TOKENS_JANELA + 1,
    });
  });

  it('registra a chamada de resumo em interacoes_ia e uso_tokens com o fluxo próprio', async () => {
    const { client } = criarClienteFalso('resumo gerado');
    registrarInteracaoComTokens(100, 'trace-1', LIMITE_TOKENS_JANELA + 1);

    await verificarGatilhoResumo(db, client, 100);

    const interacoes = lerInteracoes().filter((i) => i.fluxo === FLUXO_RESUMIR_CONTEXTO);
    expect(interacoes).toHaveLength(1);
    expect(interacoes[0]).toMatchObject({
      modelo: MODELO_RESUMO,
      resposta_modelo: 'resumo gerado',
      chat_id: 100,
      tokens_prompt: 50,
      tokens_completion: 20,
    });

    const usoTokens = lerUsoTokens().filter((u) => u.fluxo === FLUXO_RESUMIR_CONTEXTO);
    expect(usoTokens).toHaveLength(1);
    expect(usoTokens[0]).toMatchObject({ modelo: MODELO_RESUMO, tokens_prompt: 50, tokens_completion: 20 });
  });

  it('usa o resumo cumulativo (resumo anterior + só as mensagens depois dele) ao disparar de novo', async () => {
    const { client, create } = criarClienteFalso('resumo mais recente');
    criarResumoConversa(db, {
      chatId: 100,
      resumoTexto: 'resumo antigo já existente',
      cobreAteTraceId: 'trace-antiga',
      tokensJanelaNoGatilho: 6500,
    });
    registrarInteracaoComTokens(100, 'trace-antiga', 100); // antes do resumo, não deve entrar na janela nova
    registrarInteracaoComTokens(100, 'trace-nova', LIMITE_TOKENS_JANELA + 1);

    await verificarGatilhoResumo(db, client, 100);

    const mensagensEnviadas = create.mock.calls[0]?.[0]?.messages;
    expect(mensagensEnviadas[1].content).toContain('resumo antigo já existente');
    expect(mensagensEnviadas[1].content).toContain('pergunta trace-nova');
    expect(mensagensEnviadas[1].content).not.toContain('pergunta trace-antiga');

    expect(obterUltimoResumo(db, 100)?.cobreAteTraceId).toBe('trace-nova');
  });

  it('não mistura o gatilho de um chat com o de outro', async () => {
    const { client, create } = criarClienteFalso('resumo gerado');
    registrarInteracaoComTokens(100, 'trace-100', LIMITE_TOKENS_JANELA + 1);
    registrarInteracaoComTokens(200, 'trace-200', 10);

    await verificarGatilhoResumo(db, client, 200);

    expect(create).not.toHaveBeenCalled();
    expect(obterUltimoResumo(db, 200)).toBeUndefined();
  });
});
