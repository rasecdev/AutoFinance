import OpenAI from 'openai';
import { paraDefinicaoOpenAI } from './tools/registry.js';
import type { ToolContext, ToolDefinition } from './tools/types.js';

export const MODELO_PADRAO = 'openai/gpt-4o-mini';

const MAX_ITERACOES_TOOL_CALLING = 5;

export function createOpenRouterClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
  });
}

export type ToolCallRegistrada = {
  nome: string;
  argumentos: unknown;
};

export type RespostaGerada = {
  modelo: string;
  resposta: string;
  toolCalls: ToolCallRegistrada[];
};

export async function gerarResposta(
  client: OpenAI,
  mensagemUsuario: string,
  tools: ToolDefinition[] = [],
  ctx: ToolContext = { chatId: 0 },
): Promise<RespostaGerada> {
  const registry = new Map(tools.map((tool) => [tool.name, tool]));
  const ferramentas = tools.length > 0 ? tools.map(paraDefinicaoOpenAI) : undefined;

  const mensagens: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'user', content: mensagemUsuario },
  ];
  const toolCallsRegistradas: ToolCallRegistrada[] = [];

  for (let iteracao = 0; iteracao < MAX_ITERACOES_TOOL_CALLING; iteracao++) {
    const completion = await client.chat.completions.create({
      model: MODELO_PADRAO,
      messages: mensagens,
      ...(ferramentas ? { tools: ferramentas, tool_choice: 'auto' as const } : {}),
    });

    const mensagem = completion.choices[0]?.message;

    if (!mensagem?.tool_calls || mensagem.tool_calls.length === 0) {
      return {
        modelo: MODELO_PADRAO,
        resposta: mensagem?.content ?? '',
        toolCalls: toolCallsRegistradas,
      };
    }

    mensagens.push(mensagem);

    for (const toolCall of mensagem.tool_calls) {
      if (toolCall.type !== 'function') continue;

      const resultado = await executarToolCall(registry.get(toolCall.function.name), toolCall, ctx);
      toolCallsRegistradas.push({ nome: toolCall.function.name, argumentos: resultado.argumentos });
      mensagens.push({ role: 'tool', tool_call_id: toolCall.id, content: resultado.conteudo });
    }
  }

  throw new Error(`limite de ${MAX_ITERACOES_TOOL_CALLING} iterações de tool calling excedido`);
}

async function executarToolCall(
  tool: ToolDefinition | undefined,
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
  ctx: ToolContext,
): Promise<{ conteudo: string; argumentos: unknown }> {
  if (toolCall.type !== 'function') {
    return { conteudo: 'Tipo de ferramenta não suportado', argumentos: null };
  }

  if (!tool) {
    return { conteudo: `Ferramenta desconhecida: ${toolCall.function.name}`, argumentos: null };
  }

  let argumentosBrutos: unknown;
  try {
    argumentosBrutos = JSON.parse(toolCall.function.arguments || '{}');
  } catch {
    return { conteudo: 'Argumentos inválidos: JSON malformado', argumentos: null };
  }

  const validacao = tool.schema.safeParse(argumentosBrutos);
  if (!validacao.success) {
    return {
      conteudo: `Argumentos inválidos para ${tool.name}: ${validacao.error.message}`,
      argumentos: argumentosBrutos,
    };
  }

  try {
    const conteudo = await tool.handler(validacao.data, ctx);
    return { conteudo, argumentos: validacao.data };
  } catch (erro) {
    const mensagemErro = erro instanceof Error ? erro.message : String(erro);
    return { conteudo: `Erro ao executar ${tool.name}: ${mensagemErro}`, argumentos: validacao.data };
  }
}
