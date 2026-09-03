import type OpenAI from 'openai';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { MODELO_PADRAO, gerarResposta } from '../../src/ai/openrouter.js';
import type { ToolDefinition } from '../../src/ai/tools/types.js';

function criarClienteFalso(...respostas: unknown[]): OpenAI {
  const create = vi.fn();
  for (const resposta of respostas) {
    create.mockImplementationOnce(async () => resposta);
  }
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

function respostaTexto(
  texto: string,
  usage?: { prompt_tokens: number; completion_tokens: number; cost?: number },
) {
  return { choices: [{ message: { content: texto } }], usage };
}

function respostaErroModelo() {
  return { choices: [{ finish_reason: 'error', message: { content: null } }] };
}

function respostaToolCall(
  nome: string,
  argumentos: unknown,
  id = 'call-1',
  usage?: { prompt_tokens: number; completion_tokens: number },
) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id,
              type: 'function',
              function: { name: nome, arguments: JSON.stringify(argumentos) },
            },
          ],
        },
      },
    ],
    usage,
  };
}

describe('gerarResposta — sem ferramentas (compatibilidade)', () => {
  it('retorna a resposta em texto sem chamar tool_calls', async () => {
    const client = criarClienteFalso(respostaTexto('olá!'));

    const resultado = await gerarResposta(client, 'oi');

    expect(resultado).toEqual({
      modelo: MODELO_PADRAO,
      resposta: 'olá!',
      toolCalls: [],
      tokensPrompt: 0,
      tokensCompletion: 0,
      cachedTokens: 0,
      cacheWriteTokens: 0,
      custoReal: 0,
      duracaoMs: expect.any(Number),
    });
  });

  it('lê o custo real (usage.cost) devolvido pelo OpenRouter — 1 crédito = 1 USD', async () => {
    const client = criarClienteFalso(
      respostaTexto('olá!', { prompt_tokens: 100, completion_tokens: 20, cost: 0.000123 }),
    );

    const resultado = await gerarResposta(client, 'oi');

    expect(resultado.custoReal).toBe(0.000123);
  });

  it('sempre envia o system prompt como primeira mensagem', async () => {
    const client = criarClienteFalso(respostaTexto('olá!'));
    const create = client.chat.completions.create as unknown as ReturnType<typeof vi.fn>;

    await gerarResposta(client, 'oi');

    const mensagensEnviadas = create.mock.calls[0]?.[0]?.messages;
    expect(mensagensEnviadas[0]).toMatchObject({ role: 'system' });
    expect(mensagensEnviadas[0].content).toContain('Nunca invente ou substitua um valor');
    expect(mensagensEnviadas[1]).toEqual({ role: 'user', content: 'oi' });
  });
});

describe('gerarResposta — prompt caching nativo (Fase 5, Tarefa 25)', () => {
  it('não envia cache_control quando o modelo não é da Anthropic', async () => {
    const client = criarClienteFalso(respostaTexto('olá!'));
    const create = client.chat.completions.create as unknown as ReturnType<typeof vi.fn>;

    await gerarResposta(client, 'oi', [], { chatId: 0 }, [], 'openai/gpt-4o-mini');

    const mensagemSystem = create.mock.calls[0]?.[0]?.messages[0];
    expect(mensagemSystem.content).toEqual(expect.any(String));
  });

  it('envia cache_control ephemeral com ttl de 1h no system prompt quando o modelo é Anthropic', async () => {
    const client = criarClienteFalso(respostaTexto('olá!'));
    const create = client.chat.completions.create as unknown as ReturnType<typeof vi.fn>;

    await gerarResposta(client, 'oi', [], { chatId: 0 }, [], 'anthropic/claude-3-haiku');

    const mensagemSystem = create.mock.calls[0]?.[0]?.messages[0];
    expect(mensagemSystem.role).toBe('system');
    expect(mensagemSystem.content).toEqual([
      {
        type: 'text',
        text: expect.any(String),
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
    ]);
  });

  it('acumula cachedTokens/cacheWriteTokens de usage.prompt_tokens_details quando presentes', async () => {
    const client = criarClienteFalso({
      choices: [{ message: { content: 'olá!' } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 10,
        prompt_tokens_details: { cached_tokens: 80, cache_write_tokens: 20 },
      },
    });

    const resultado = await gerarResposta(client, 'oi', [], { chatId: 0 }, [], 'anthropic/claude-3-haiku');

    expect(resultado.cachedTokens).toBe(80);
    expect(resultado.cacheWriteTokens).toBe(20);
  });

  it('cachedTokens/cacheWriteTokens ficam 0 quando prompt_tokens_details não vem na resposta', async () => {
    const client = criarClienteFalso(respostaTexto('olá!', { prompt_tokens: 5, completion_tokens: 2 }));

    const resultado = await gerarResposta(client, 'oi');

    expect(resultado.cachedTokens).toBe(0);
    expect(resultado.cacheWriteTokens).toBe(0);
  });
});

describe('gerarResposta — loop de tool calling', () => {
  const ecoar: ToolDefinition = {
    name: 'ecoar',
    description: 'Repete o texto recebido',
    schema: z.object({ texto: z.string() }),
    handler: async (args) => `eco: ${(args as { texto: string }).texto}`,
  };

  it('executa a ferramenta chamada pelo modelo e devolve a resposta final', async () => {
    const client = criarClienteFalso(
      respostaToolCall('ecoar', { texto: 'oi' }, 'call-1', { prompt_tokens: 10, completion_tokens: 5 }),
      respostaTexto('a ferramenta disse: eco: oi', { prompt_tokens: 20, completion_tokens: 8 }),
    );

    const resultado = await gerarResposta(client, 'usa a ferramenta eco com "oi"', [ecoar]);

    expect(resultado.resposta).toBe('a ferramenta disse: eco: oi');
    expect(resultado.toolCalls).toEqual([{ nome: 'ecoar', argumentos: { texto: 'oi' } }]);
    expect(resultado.tokensPrompt).toBe(30);
    expect(resultado.tokensCompletion).toBe(13);
  });

  it('resolve a ferramenta mesmo quando o modelo prefixa o nome (ex: "default_api.ecoar", achado real testando Gemini)', async () => {
    const client = criarClienteFalso(
      respostaToolCall('default_api.ecoar', { texto: 'oi' }),
      respostaTexto('a ferramenta disse: eco: oi'),
    );

    const resultado = await gerarResposta(client, 'usa a ferramenta eco com "oi"', [ecoar]);

    expect(resultado.resposta).toBe('a ferramenta disse: eco: oi');
    expect(resultado.toolCalls).toEqual([{ nome: 'default_api.ecoar', argumentos: { texto: 'oi' } }]);
  });

  it('rejeita argumento inválido sem executar o handler', async () => {
    const handler = vi.fn();
    const toolComHandlerEspiao: ToolDefinition = { ...ecoar, handler };
    const client = criarClienteFalso(
      respostaToolCall('ecoar', { texto: 123 }),
      respostaTexto('resposta final'),
    );

    await gerarResposta(client, 'msg', [toolComHandlerEspiao]);

    expect(handler).not.toHaveBeenCalled();
  });

  it('reporta ferramenta desconhecida sem lançar exceção', async () => {
    const client = criarClienteFalso(
      respostaToolCall('nao_existe', {}),
      respostaTexto('resposta final'),
    );

    const resultado = await gerarResposta(client, 'msg', [ecoar]);

    expect(resultado.resposta).toBe('resposta final');
    expect(resultado.toolCalls).toEqual([{ nome: 'nao_existe', argumentos: null }]);
  });

  it('não executa ferramenta marcada como requerConfirmacao — devolve pendência e pergunta', async () => {
    const handler = vi.fn();
    const toolAltoImpacto: ToolDefinition = { ...ecoar, name: 'excluir_transacao', requerConfirmacao: true, handler };
    const client = criarClienteFalso(respostaToolCall('excluir_transacao', { texto: 'x' }));

    const resultado = await gerarResposta(client, 'exclui essa transação', [toolAltoImpacto]);

    expect(handler).not.toHaveBeenCalled();
    expect(resultado.pendenciaConfirmacao).toEqual({
      tool: toolAltoImpacto,
      argumentos: { texto: 'x' },
    });
    expect(resultado.resposta).toContain('excluir_transacao');
    expect(resultado.resposta.toLowerCase()).toContain('confirma');
  });

  it('inclui o texto de avisoConfirmacao antes da pergunta genérica, quando a ferramenta define um', async () => {
    const handler = vi.fn();
    const toolComAviso: ToolDefinition = {
      ...ecoar,
      name: 'amortizar_divida',
      requerConfirmacao: true,
      avisoConfirmacao: (args) => `Estimativa calculada pra ${JSON.stringify(args)}.`,
      handler,
    };
    const client = criarClienteFalso(respostaToolCall('amortizar_divida', { texto: 'x' }));

    const resultado = await gerarResposta(client, 'amortiza', [toolComAviso]);

    expect(resultado.resposta.startsWith('Estimativa calculada pra')).toBe(true);
    expect(resultado.resposta).toContain('Confirma a ação "amortizar_divida"');
  });

  it('não quebra quando a ferramenta não define avisoConfirmacao (comportamento anterior preservado)', async () => {
    const handler = vi.fn();
    const toolSemAviso: ToolDefinition = { ...ecoar, name: 'excluir_transacao', requerConfirmacao: true, handler };
    const client = criarClienteFalso(respostaToolCall('excluir_transacao', { texto: 'x' }));

    const resultado = await gerarResposta(client, 'exclui', [toolSemAviso]);

    expect(resultado.resposta.startsWith('Confirma a ação "excluir_transacao"')).toBe(true);
  });

  it('retenta uma vez quando o modelo devolve finish_reason "error" (achado real: falha intermitente do Gemini)', async () => {
    const client = criarClienteFalso(respostaErroModelo(), respostaTexto('funcionou na segunda tentativa'));

    const resultado = await gerarResposta(client, 'msg', [ecoar]);

    expect(resultado.resposta).toBe('funcionou na segunda tentativa');
  });

  it('desiste depois de uma retentativa e devolve resposta vazia sem lançar exceção', async () => {
    const client = criarClienteFalso(respostaErroModelo(), respostaErroModelo());

    const resultado = await gerarResposta(client, 'msg', [ecoar]);

    expect(resultado.resposta).toBe('');
  });

  it('lança erro tratável ao exceder o limite de iterações', async () => {
    const client = criarClienteFalso(
      respostaToolCall('ecoar', { texto: '1' }, 'call-1'),
      respostaToolCall('ecoar', { texto: '2' }, 'call-2'),
      respostaToolCall('ecoar', { texto: '3' }, 'call-3'),
      respostaToolCall('ecoar', { texto: '4' }, 'call-4'),
      respostaToolCall('ecoar', { texto: '5' }, 'call-5'),
    );

    await expect(gerarResposta(client, 'msg', [ecoar])).rejects.toThrow(/limite de \d+ iterações/);
  });
});
