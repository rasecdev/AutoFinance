import type OpenAI from 'openai';
import type { Idioma } from '../../db/repositories/idiomaBot.js';
import { gerarPerguntaConfirmacao } from '../confirmacao/pergunta.js';
import { MODELO_PADRAO, montarMensagemSystem, type UsageComCusto } from '../openrouter.js';
import { paraDefinicaoOpenAI } from '../tools/registry.js';
import type { ToolContext, ToolDefinition } from '../tools/types.js';
import { executarToolCall, resolverTool } from './executarToolCall.js';
import type { DocumentoTool, RespostaGerada, ToolCallRegistrada } from './tipos.js';

const MAX_ITERACOES_TOOL_CALLING = 5;
const MAX_RETENTATIVAS_FALHA_MODELO = 1;

export async function gerarResposta(
  client: OpenAI,
  mensagemUsuario: string,
  tools: ToolDefinition[] = [],
  ctx: ToolContext = { chatId: 0 },
  historico: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [],
  modelo: string = MODELO_PADRAO,
  idioma: Idioma = 'pt',
): Promise<RespostaGerada> {
  const inicio = Date.now();
  const registry = new Map(tools.map((tool) => [tool.name, tool]));
  const ferramentas = tools.length > 0 ? tools.map(paraDefinicaoOpenAI) : undefined;

  const mensagens: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    montarMensagemSystem(modelo, idioma),
    ...historico,
    { role: 'user', content: mensagemUsuario },
  ];
  const toolCallsRegistradas: ToolCallRegistrada[] = [];
  const imagens: Buffer[] = [];
  const documentos: DocumentoTool[] = [];
  let tokensPrompt = 0;
  let tokensCompletion = 0;
  let cachedTokens = 0;
  let cacheWriteTokens = 0;
  let custoReal = 0;

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
    custoReal += (completion.usage as UsageComCusto | undefined)?.cost ?? 0;

    const mensagem = completion.choices[0]?.message;

    if (!mensagem?.tool_calls || mensagem.tool_calls.length === 0) {
      return {
        modelo,
        resposta: mensagem?.content ?? '',
        toolCalls: toolCallsRegistradas,
        imagens,
        documentos,
        tokensPrompt,
        tokensCompletion,
        cachedTokens,
        cacheWriteTokens,
        custoReal,
        duracaoMs: Date.now() - inicio,
      };
    }

    mensagens.push(mensagem);

    for (const toolCall of mensagem.tool_calls) {
      if (toolCall.type !== 'function') continue;

      const resultado = await executarToolCall(resolverTool(registry, toolCall.function.name), toolCall, {
        ...ctx,
        modelo,
      });

      if (resultado.tipo === 'pendente_confirmacao') {
        return {
          modelo,
          resposta: gerarPerguntaConfirmacao(resultado.tool, resultado.argumentos),
          toolCalls: [...toolCallsRegistradas, { nome: resultado.tool.name, argumentos: resultado.argumentos }],
          imagens,
          documentos,
          tokensPrompt,
          tokensCompletion,
          cachedTokens,
          cacheWriteTokens,
          custoReal,
          duracaoMs: Date.now() - inicio,
          pendenciaConfirmacao: { tool: resultado.tool, argumentos: resultado.argumentos },
        };
      }

      toolCallsRegistradas.push({ nome: toolCall.function.name, argumentos: resultado.argumentos });
      if (resultado.imagem) imagens.push(resultado.imagem);
      if (resultado.documento) documentos.push(resultado.documento);
      mensagens.push({ role: 'tool', tool_call_id: toolCall.id, content: resultado.conteudo });
    }
  }

  throw new Error(`limite de ${MAX_ITERACOES_TOOL_CALLING} iterações de tool calling excedido`);
}
