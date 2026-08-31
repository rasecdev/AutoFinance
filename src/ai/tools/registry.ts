import { z } from 'zod';
import type OpenAI from 'openai';
import type { ToolDefinition } from './types.js';

export function paraDefinicaoOpenAI(tool: ToolDefinition): OpenAI.Chat.Completions.ChatCompletionTool {
  const jsonSchema = z.toJSONSchema(tool.schema) as Record<string, unknown>;
  delete jsonSchema.$schema;

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: jsonSchema,
    },
  };
}
