import type OpenAI from 'openai';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { gerarResposta } from '../../src/ai/openrouter.js';
import type { ToolDefinition } from '../../src/ai/tools/types.js';

function criarClienteFalso(...respostas: unknown[]): OpenAI {
  const create = vi.fn();
  for (const resposta of respostas) {
    create.mockImplementationOnce(async () => resposta);
  }
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

function respostaTexto(texto: string, usage?: { prompt_tokens: number; completion_tokens: number }) {
  return { choices: [{ message: { content: texto } }], usage };
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
      modelo: 'openai/gpt-4o-mini',
      resposta: 'olá!',
      toolCalls: [],
      tokensPrompt: 0,
      tokensCompletion: 0,
    });
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
