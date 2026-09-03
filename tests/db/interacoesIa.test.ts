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
import {
  atualizarAvaliacaoInteracao,
  buscarUltimaInteracaoCorreta,
  buscarUltimasInteracoesPorChat,
  contarInteracoesAvaliadasIncorretas,
  registrarInteracaoIa,
  somarTokensChat,
} from '../../src/db/repositories/interacoesIa.js';
import { obterTraceIdPorMensagem } from '../../src/bot/rastroRespostas.js';
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
    reply: vi.fn().mockResolvedValue({ message_id: 999 }),
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

describe('atualizarAvaliacaoInteracao', () => {
  it('marca avaliacao_usuario e retorna true quando a interação existe', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-avaliar',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      resultado: 'sucesso',
    });

    const atualizado = atualizarAvaliacaoInteracao(db, 'trace-avaliar', 'incorreto');

    expect(atualizado).toBe(true);
    expect(lerInteracoes()[0]).toMatchObject({ avaliacao_usuario: 'incorreto' });
  });

  it('retorna false quando o trace_id não existe', () => {
    expect(atualizarAvaliacaoInteracao(db, 'trace-inexistente', 'incorreto')).toBe(false);
  });
});

describe('buscarUltimasInteracoesPorChat (Fase 4, Tarefa 17)', () => {
  it('retorna as últimas N interações de um chat em ordem cronológica', () => {
    for (let i = 1; i <= 5; i += 1) {
      registrarInteracaoIa(db, {
        traceId: `trace-${i}`,
        fluxo: 'conversa_texto',
        modelo: 'openai/gpt-4o-mini',
        mensagemUsuario: `mensagem ${i}`,
        respostaModelo: `resposta ${i}`,
        resultado: 'sucesso',
        chatId: 100,
      });
    }

    const ultimas = buscarUltimasInteracoesPorChat(db, 100, 3);

    expect(ultimas.map((i) => i.traceId)).toEqual(['trace-3', 'trace-4', 'trace-5']);
  });

  it('ignora interações de outros chats', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-chat-100',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      resultado: 'sucesso',
      chatId: 100,
    });
    registrarInteracaoIa(db, {
      traceId: 'trace-chat-200',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      resultado: 'sucesso',
      chatId: 200,
    });

    const ultimas = buscarUltimasInteracoesPorChat(db, 100, 10);

    expect(ultimas.map((i) => i.traceId)).toEqual(['trace-chat-100']);
  });

  it('retorna só as interações depois de um trace_id quando informado', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-antiga',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      resultado: 'sucesso',
      chatId: 100,
    });
    registrarInteracaoIa(db, {
      traceId: 'trace-nova',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      resultado: 'sucesso',
      chatId: 100,
    });

    const ultimas = buscarUltimasInteracoesPorChat(db, 100, 10, 'trace-antiga');

    expect(ultimas.map((i) => i.traceId)).toEqual(['trace-nova']);
  });
});

describe('somarTokensChat (Fase 4, Tarefa 17)', () => {
  it('soma tokens_prompt + tokens_completion de todas as interações do chat', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-1',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      resultado: 'sucesso',
      chatId: 100,
      tokensPrompt: 50,
      tokensCompletion: 20,
    });
    registrarInteracaoIa(db, {
      traceId: 'trace-2',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      resultado: 'sucesso',
      chatId: 100,
      tokensPrompt: 30,
      tokensCompletion: 10,
    });

    expect(somarTokensChat(db, 100)).toBe(110);
  });

  it('soma só a partir de um trace_id quando informado', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-antiga',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      resultado: 'sucesso',
      chatId: 100,
      tokensPrompt: 50,
      tokensCompletion: 20,
    });
    registrarInteracaoIa(db, {
      traceId: 'trace-nova',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      resultado: 'sucesso',
      chatId: 100,
      tokensPrompt: 30,
      tokensCompletion: 10,
    });

    expect(somarTokensChat(db, 100, 'trace-antiga')).toBe(40);
  });

  it('retorna 0 quando o chat não tem interações', () => {
    expect(somarTokensChat(db, 999)).toBe(0);
  });
});

describe('contarInteracoesAvaliadasIncorretas (Fase 6, Tarefa 27)', () => {
  it('conta só interações marcadas como incorreto dentro do período', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-1',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      resultado: 'sucesso',
    });
    registrarInteracaoIa(db, {
      traceId: 'trace-2',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      resultado: 'sucesso',
    });
    atualizarAvaliacaoInteracao(db, 'trace-1', 'incorreto');
    atualizarAvaliacaoInteracao(db, 'trace-2', 'correto');

    const agora = new Date();
    const umaHoraAntes = new Date(agora.getTime() - 3600_000).toISOString();
    const umaHoraDepois = new Date(agora.getTime() + 3600_000).toISOString();

    expect(contarInteracoesAvaliadasIncorretas(db, { inicio: umaHoraAntes, fim: umaHoraDepois })).toBe(1);
  });

  it('retorna 0 fora da janela do período', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-1',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      resultado: 'sucesso',
    });
    atualizarAvaliacaoInteracao(db, 'trace-1', 'incorreto');

    const agora = new Date();
    const duasHorasAntes = new Date(agora.getTime() - 7200_000).toISOString();
    const umaHoraAntes = new Date(agora.getTime() - 3600_000).toISOString();

    expect(contarInteracoesAvaliadasIncorretas(db, { inicio: duasHorasAntes, fim: umaHoraAntes })).toBe(0);
  });
});

describe('buscarUltimaInteracaoCorreta (Fase 6, Tarefa 33)', () => {
  it('retorna undefined quando não há nenhuma interação correta no chat', () => {
    expect(buscarUltimaInteracaoCorreta(db, 100)).toBeUndefined();
  });

  it('retorna a última interação marcada como correta, com mensagem e tool_calls', () => {
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

    const interacao = buscarUltimaInteracaoCorreta(db, 100);

    expect(interacao).toEqual({
      traceId: 'trace-1',
      mensagemUsuario: 'registra 30 reais de uber em transporte',
      toolCalls: [{ nome: 'registrar_transacao', argumentos: { valor: 30, categoria: 'transporte' } }],
    });
  });

  it('ignora interação incorreta ou sem avaliação, só considera correta', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-1',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'sem avaliação',
      resultado: 'sucesso',
      chatId: 100,
    });
    registrarInteracaoIa(db, {
      traceId: 'trace-2',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'marcada errada',
      resultado: 'sucesso',
      chatId: 100,
    });
    atualizarAvaliacaoInteracao(db, 'trace-2', 'incorreto');

    expect(buscarUltimaInteracaoCorreta(db, 100)).toBeUndefined();
  });

  it('retorna toolCalls null quando a interação correta não chamou nenhuma ferramenta', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-1',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'oi',
      respostaModelo: 'olá! como posso ajudar?',
      resultado: 'sucesso',
      chatId: 100,
    });
    atualizarAvaliacaoInteracao(db, 'trace-1', 'correto');

    expect(buscarUltimaInteracaoCorreta(db, 100)?.toolCalls).toBeNull();
  });

  it('não mistura interação correta de chats diferentes', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-1',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'chat 100',
      resultado: 'sucesso',
      chatId: 100,
    });
    atualizarAvaliacaoInteracao(db, 'trace-1', 'correto');

    expect(buscarUltimaInteracaoCorreta(db, 200)).toBeUndefined();
  });

  it('retorna a mais recente quando há mais de uma interação correta', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-1',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'primeira',
      resultado: 'sucesso',
      chatId: 100,
    });
    registrarInteracaoIa(db, {
      traceId: 'trace-2',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'segunda',
      resultado: 'sucesso',
      chatId: 100,
    });
    atualizarAvaliacaoInteracao(db, 'trace-1', 'correto');
    atualizarAvaliacaoInteracao(db, 'trace-2', 'correto');

    expect(buscarUltimaInteracaoCorreta(db, 100)?.mensagemUsuario).toBe('segunda');
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
      chat_id: 111,
      tokens_prompt: 7,
      tokens_completion: 3,
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

  it('injeta o turno anterior do mesmo chat no prompt da segunda mensagem (Tarefa 19)', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'você gastou R$ 1000 em março' } }],
        usage: { prompt_tokens: 7, completion_tokens: 3 },
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'em fevereiro você gastou R$ 800' } }],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      });
    const client = { chat: { completions: { create } } } as unknown as OpenAI;
    const logger = createLogger({ write() {} });
    const handler = createHandlerTexto(client, db, logger);

    await handler(criarContextoFake('quanto gastei em março?', 777));
    await handler(criarContextoFake('e em fevereiro?', 777));

    const mensagensSegundaChamada = create.mock.calls[1]?.[0]?.messages;
    expect(mensagensSegundaChamada).toEqual(
      expect.arrayContaining([
        { role: 'user', content: 'quanto gastei em março?' },
        { role: 'assistant', content: 'você gastou R$ 1000 em março' },
        { role: 'user', content: 'e em fevereiro?' },
      ]),
    );
  });

  it('rastreia o message_id da resposta enviada pro trace_id da interação (Tarefa 16)', async () => {
    const client = criarClienteOpenAiFalso('resposta gerada pela IA');
    const logger = createLogger({ write() {} });
    const handler = createHandlerTexto(client, db, logger);
    const ctx = criarContextoFake('quanto gastei esse mês?');

    await handler(ctx);

    const linhas = lerInteracoes();
    const traceId = linhas[0]?.trace_id as string;
    expect(obterTraceIdPorMensagem(999)).toBe(traceId);
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

  it('dá uma dica acionável quando o erro é de modelo inválido (status 400, achado real de teste manual)', async () => {
    const erroModeloInvalido = Object.assign(new Error('400 GPT-5 Nano is not a valid model ID'), {
      status: 400,
    });
    const client = criarClienteOpenAiFalso(erroModeloInvalido);
    const logger = createLogger({ write() {} });
    const handler = createHandlerTexto(client, db, logger);
    const ctx = criarContextoFake('oi');

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('/modelo'));
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('slug'));
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
