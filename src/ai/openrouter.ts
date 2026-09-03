import OpenAI from 'openai';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { paraDefinicaoOpenAI } from './tools/registry.js';
import type { ToolContext, ToolDefinition } from './tools/types.js';

export const MODELO_PADRAO = 'openai/gpt-4o-mini';

const MAX_ITERACOES_TOOL_CALLING = 5;
const MAX_RETENTATIVAS_FALHA_MODELO = 1;

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

export type PendenciaConfirmacao = {
  tool: ToolDefinition;
  argumentos: unknown;
};

export type RespostaGerada = {
  modelo: string;
  resposta: string;
  toolCalls: ToolCallRegistrada[];
  tokensPrompt: number;
  tokensCompletion: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  duracaoMs: number;
  pendenciaConfirmacao?: PendenciaConfirmacao;
};

type ResultadoToolCall =
  | { tipo: 'executado'; conteudo: string; argumentos: unknown }
  | { tipo: 'pendente_confirmacao'; tool: ToolDefinition; argumentos: unknown };

function gerarPerguntaConfirmacao(tool: ToolDefinition, argumentos: unknown): string {
  const base = `Confirma a ação "${tool.name}" com os parâmetros ${JSON.stringify(argumentos)}? Responda "sim" para confirmar, ou qualquer outra coisa para cancelar.`;
  const aviso = tool.avisoConfirmacao?.(argumentos);
  return aviso ? `${aviso}\n\n${base}` : base;
}

// Prompt caching nativo (Fase 5, Tarefa 25): Anthropic, via OpenRouter, só
// cacheia quando cache_control vem explícito no bloco de conteúdo (diferente
// de OpenAI/Gemini, que cacheiam sozinhos sem configuração nenhuma) — sem
// isso o Claude nunca reaproveita o prefixo fixo do prompt (system + tools),
// mesmo passando pelo gateway. TTL de 1h em vez do padrão de 5min: bot
// pessoal de uso esporádico esvaziaria o cache padrão entre mensagens.
type BlocoTextoComCache = OpenAI.Chat.Completions.ChatCompletionContentPartText & {
  cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' };
};

function montarMensagemSystem(modelo: string): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  if (!modelo.startsWith('anthropic/')) {
    return { role: 'system', content: SYSTEM_PROMPT };
  }

  const bloco: BlocoTextoComCache = {
    type: 'text',
    text: SYSTEM_PROMPT,
    cache_control: { type: 'ephemeral', ttl: '1h' },
  };

  return { role: 'system', content: [bloco] };
}

export async function gerarResposta(
  client: OpenAI,
  mensagemUsuario: string,
  tools: ToolDefinition[] = [],
  ctx: ToolContext = { chatId: 0 },
  historico: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [],
  modelo: string = MODELO_PADRAO,
): Promise<RespostaGerada> {
  const inicio = Date.now();
  const registry = new Map(tools.map((tool) => [tool.name, tool]));
  const ferramentas = tools.length > 0 ? tools.map(paraDefinicaoOpenAI) : undefined;

  const mensagens: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    montarMensagemSystem(modelo),
    ...historico,
    { role: 'user', content: mensagemUsuario },
  ];
  const toolCallsRegistradas: ToolCallRegistrada[] = [];
  let tokensPrompt = 0;
  let tokensCompletion = 0;
  let cachedTokens = 0;
  let cacheWriteTokens = 0;

  for (let iteracao = 0; iteracao < MAX_ITERACOES_TOOL_CALLING; iteracao++) {
    let completion = await client.chat.completions.create({
      model: modelo,
      messages: mensagens,
      ...(ferramentas ? { tools: ferramentas, tool_choice: 'auto' as const } : {}),
    });

    // Achado real testando Gemini via OpenRouter: o modelo às vezes falha internamente
    // ao montar uma chamada de função (finish_reason "error"/"MALFORMED_FUNCTION_CALL")
    // e devolve tudo vazio (sem content, sem tool_calls, sem usage) — intermitente, a
    // mesma pergunta funciona logo depois. Retentar uma vez antes de desistir.
    for (
      let retentativa = 0;
      (completion.choices[0]?.finish_reason as string) === 'error' &&
      retentativa < MAX_RETENTATIVAS_FALHA_MODELO;
      retentativa++
    ) {
      completion = await client.chat.completions.create({
        model: modelo,
        messages: mensagens,
        ...(ferramentas ? { tools: ferramentas, tool_choice: 'auto' as const } : {}),
      });
    }

    tokensPrompt += completion.usage?.prompt_tokens ?? 0;
    tokensCompletion += completion.usage?.completion_tokens ?? 0;
    cachedTokens += completion.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    cacheWriteTokens += completion.usage?.prompt_tokens_details?.cache_write_tokens ?? 0;

    const mensagem = completion.choices[0]?.message;

    if (!mensagem?.tool_calls || mensagem.tool_calls.length === 0) {
      return {
        modelo,
        resposta: mensagem?.content ?? '',
        toolCalls: toolCallsRegistradas,
        tokensPrompt,
        tokensCompletion,
        cachedTokens,
        cacheWriteTokens,
        duracaoMs: Date.now() - inicio,
      };
    }

    mensagens.push(mensagem);

    for (const toolCall of mensagem.tool_calls) {
      if (toolCall.type !== 'function') continue;

      const resultado = await executarToolCall(resolverTool(registry, toolCall.function.name), toolCall, ctx);

      if (resultado.tipo === 'pendente_confirmacao') {
        return {
          modelo,
          resposta: gerarPerguntaConfirmacao(resultado.tool, resultado.argumentos),
          toolCalls: [...toolCallsRegistradas, { nome: resultado.tool.name, argumentos: resultado.argumentos }],
          tokensPrompt,
          tokensCompletion,
          cachedTokens,
          cacheWriteTokens,
          duracaoMs: Date.now() - inicio,
          pendenciaConfirmacao: { tool: resultado.tool, argumentos: resultado.argumentos },
        };
      }

      toolCallsRegistradas.push({ nome: toolCall.function.name, argumentos: resultado.argumentos });
      mensagens.push({ role: 'tool', tool_call_id: toolCall.id, content: resultado.conteudo });
    }
  }

  throw new Error(`limite de ${MAX_ITERACOES_TOOL_CALLING} iterações de tool calling excedido`);
}

function resolverTool(registry: Map<string, ToolDefinition>, nome: string): ToolDefinition | undefined {
  const direto = registry.get(nome);
  if (direto) return direto;

  // Alguns modelos (ex: Gemini via OpenRouter) prefixam o nome da função com algo
  // como "default_api." — cai pro nome depois do último ponto antes de desistir.
  const semPrefixo = nome.includes('.') ? nome.slice(nome.lastIndexOf('.') + 1) : undefined;
  return semPrefixo ? registry.get(semPrefixo) : undefined;
}

async function executarToolCall(
  tool: ToolDefinition | undefined,
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
  ctx: ToolContext,
): Promise<ResultadoToolCall> {
  if (toolCall.type !== 'function') {
    return { tipo: 'executado', conteudo: 'Tipo de ferramenta não suportado', argumentos: null };
  }

  if (!tool) {
    return { tipo: 'executado', conteudo: `Ferramenta desconhecida: ${toolCall.function.name}`, argumentos: null };
  }

  let argumentosBrutos: unknown;
  try {
    argumentosBrutos = JSON.parse(toolCall.function.arguments || '{}');
  } catch {
    return { tipo: 'executado', conteudo: 'Argumentos inválidos: JSON malformado', argumentos: null };
  }

  const validacao = tool.schema.safeParse(argumentosBrutos);
  if (!validacao.success) {
    return {
      tipo: 'executado',
      conteudo: `Argumentos inválidos para ${tool.name}: ${validacao.error.message}`,
      argumentos: argumentosBrutos,
    };
  }

  if (tool.requerConfirmacao) {
    return { tipo: 'pendente_confirmacao', tool, argumentos: validacao.data };
  }

  try {
    const conteudo = await tool.handler(validacao.data, ctx);
    return { tipo: 'executado', conteudo, argumentos: validacao.data };
  } catch (erro) {
    const mensagemErro = erro instanceof Error ? erro.message : String(erro);
    return {
      tipo: 'executado',
      conteudo: `Erro ao executar ${tool.name}: ${mensagemErro}`,
      argumentos: validacao.data,
    };
  }
}
