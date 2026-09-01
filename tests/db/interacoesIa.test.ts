import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MODELO_PADRAO } from '../../src/ai/openrouter.js';
import { definirPendencia, obterPendencia } from '../../src/bot/confirmacao.js';
import { createHandlerTexto } from '../../src/bot/handlers/texto.js';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { registrarInteracaoIa } from '../../src/db/repositories/interacoesIa.js';
import { createLogger } from '../../src/logging/logger.js';

const CHAVE_TESTE = 'chave-teste-interacoes-ia';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-interacoes-ia-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function lerInteracoes() {
  return db.prepare('SELECT * FROM interacoes_ia').all() as Array<Record<string, unknown>>;
}

function criarClienteOpenAiFalso(resposta: string | Error): OpenAI {
  const create = vi.fn().mockImplementation(async () => {
    if (resposta instanceof Error) {
      throw resposta;
    }
    return {
      choices: [{ message: { content: resposta } }],
      usage: { prompt_tokens: 7, completion_tokens: 3 },
    };
  });

  return { chat: { completions: { create } } } as unknown as OpenAI;
}

function lerUsoTokens() {
  return db.prepare('SELECT * FROM uso_tokens').all() as Array<Record<string, unknown>>;
}

function criarContextoFake(texto: string, chatId = 111) {
  return {
    message: { text: texto },
    chat: { id: chatId },
    reply: vi.fn(),
  } as unknown as Parameters<ReturnType<typeof createHandlerTexto>>[0] & { reply: ReturnType<typeof vi.fn> };
}

describe('registrarInteracaoIa', () => {
  it('grava uma linha com os campos esperados', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-abc',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'oi',
      respostaModelo: 'olá!',
      resultado: 'sucesso',
    });

    const linhas = lerInteracoes();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      trace_id: 'trace-abc',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagem_usuario: 'oi',
      resposta_modelo: 'olá!',
      resultado: 'sucesso',
      tool_calls: null,
    });
  });

  it('grava tool_calls como JSON quando houver', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-com-tool',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'quanto gastei em março?',
      respostaModelo: 'você gastou R$ 100',
      toolCalls: [{ nome: 'resumo_mensal', argumentos: { mes: 3 } }],
      resultado: 'sucesso',
    });

    const linhas = lerInteracoes();
    expect(JSON.parse(linhas[0].tool_calls as string)).toEqual([
      { nome: 'resumo_mensal', argumentos: { mes: 3 } },
    ]);
  });
});

describe('handlerTexto (OpenRouter mockado, sem chamada real)', () => {
  it('responde ao usuário e registra a interação como sucesso', async () => {
    const client = criarClienteOpenAiFalso('resposta gerada pela IA');
    const logger = createLogger({ write() {} });
    const handler = createHandlerTexto(client, db, logger);
    const ctx = criarContextoFake('quanto gastei esse mês?');

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('resposta gerada pela IA');

    const linhas = lerInteracoes();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      fluxo: 'conversa_texto',
      mensagem_usuario: 'quanto gastei esse mês?',
      resposta_modelo: 'resposta gerada pela IA',
      resultado: 'sucesso',
    });
    expect(linhas[0].trace_id).toEqual(expect.any(String));

    const usoTokens = lerUsoTokens();
    expect(usoTokens).toHaveLength(1);
    expect(usoTokens[0]).toMatchObject({
      fluxo: 'conversa_texto',
      modelo: MODELO_PADRAO,
      tokens_prompt: 7,
      tokens_completion: 3,
      origem: 'uso_real',
    });
  });

  it('nunca manda mensagem vazia pro Telegram (achado real: Gemini às vezes devolve content vazio)', async () => {
    const client = criarClienteOpenAiFalso('');
    const logger = createLogger({ write() {} });
    const handler = createHandlerTexto(client, db, logger);
    const ctx = criarContextoFake('oi');

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('Não entendi, pode reformular?');
  });

  it('registra falha e responde com mensagem de erro quando a chamada ao OpenRouter falha', async () => {
    const client = criarClienteOpenAiFalso(new Error('timeout'));
    const logger = createLogger({ write() {} });
    const handler = createHandlerTexto(client, db, logger);
    const ctx = criarContextoFake('oi');

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      'Não consegui processar sua mensagem agora, tente de novo em instantes.',
    );

    const linhas = lerInteracoes();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ resultado: 'erro', mensagem_usuario: 'oi' });
  });
});

describe('handlerTexto — pendência de confirmação (Tarefa 3)', () => {
  it('executa a ferramenta pendente quando o usuário confirma com "sim"', async () => {
    const client = criarClienteOpenAiFalso('não deveria ser chamado');
    const logger = createLogger({ write() {} });
    const handler = createHandlerTexto(client, db, logger);
    const chatId = 555;
    const toolHandler = vi.fn().mockResolvedValue('transação excluída com sucesso');

    definirPendencia(chatId, {
      tool: { name: 'excluir_transacao', description: '', schema: {} as never, handler: toolHandler },
      argumentos: { id: 42 },
    });

    const ctx = criarContextoFake('sim', chatId);
    await handler(ctx);

    expect(toolHandler).toHaveBeenCalledWith({ id: 42 }, { chatId });
    expect(ctx.reply).toHaveBeenCalledWith('transação excluída com sucesso');
    expect(obterPendencia(chatId)).toBeUndefined();
  });

  it('cancela a pendência sem executar quando o usuário não confirma', async () => {
    const client = criarClienteOpenAiFalso('não deveria ser chamado');
    const logger = createLogger({ write() {} });
    const handler = createHandlerTexto(client, db, logger);
    const chatId = 556;
    const toolHandler = vi.fn();

    definirPendencia(chatId, {
      tool: { name: 'excluir_transacao', description: '', schema: {} as never, handler: toolHandler },
      argumentos: { id: 42 },
    });

    const ctx = criarContextoFake('deixa quieto', chatId);
    await handler(ctx);

    expect(toolHandler).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith('Ação cancelada.');
    expect(obterPendencia(chatId)).toBeUndefined();
  });
});
