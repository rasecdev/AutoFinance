import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { paraDefinicaoOpenAI } from '../../../src/ai/tools/registry.js';
import type { ToolDefinition } from '../../../src/ai/tools/types.js';

describe('paraDefinicaoOpenAI', () => {
  it('converte uma ferramenta com schema Zod em definição de function tool', () => {
    const tool: ToolDefinition = {
      name: 'ecoar',
      description: 'Repete o texto recebido',
      schema: z.object({ texto: z.string() }),
      handler: async (args) => (args as { texto: string }).texto,
    };

    const definicao = paraDefinicaoOpenAI(tool);

    expect(definicao).toEqual({
      type: 'function',
      function: {
        name: 'ecoar',
        description: 'Repete o texto recebido',
        parameters: {
          type: 'object',
          properties: { texto: { type: 'string' } },
          required: ['texto'],
          additionalProperties: false,
        },
      },
    });
  });
});
