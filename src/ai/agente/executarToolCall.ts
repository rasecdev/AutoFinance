import type OpenAI from 'openai';
import type { ResultadoTool, ToolContext, ToolDefinition } from '../tools/types.js';
import type { DocumentoTool, ResultadoToolCall } from './tipos.js';

// Separa o texto (vai pro modelo via role: 'tool') da imagem/documento (nunca
// vão pro modelo, só são acumulados pra virar foto/arquivo no Telegram) de
// um retorno de tool.
export function extrairResultadoTool(resultado: ResultadoTool): { texto: string; imagem?: Buffer; documento?: DocumentoTool } {
  return typeof resultado === 'string' ? { texto: resultado } : resultado;
}

export function resolverTool(registry: Map<string, ToolDefinition>, nome: string): ToolDefinition | undefined {
  const direto = registry.get(nome);
  if (direto) return direto;

  // Alguns modelos (ex: Gemini via OpenRouter) prefixam o nome da função com algo
  // como "default_api." — cai pro nome depois do último ponto antes de desistir.
  const semPrefixo = nome.includes('.') ? nome.slice(nome.lastIndexOf('.') + 1) : undefined;
  return semPrefixo ? registry.get(semPrefixo) : undefined;
}

// Achado real de teste manual: modelos frequentemente emitem `null` num
// parâmetro opcional não informado (ex: conta_id) em vez de simplesmente
// omitir a chave. `z.optional()` só aceita `undefined`, não `null` — o
// resultado era falha de validação Zod pra chamadas de tool tecnicamente
// corretas, e o texto técnico do erro virava uma resposta confusa pro
// usuário (o modelo tenta parafrasear a mensagem de erro). Normaliza null
// pra "chave ausente" antes de validar contra o schema — tratado como
// equivalente a "não informado" em todo o projeto (resolverContaId etc.
// já usam essa convenção). Exportado pra o motor de benchmark (benchmark.ts)
// aplicar a mesma normalização na comparação com o gabarito.
export function removerChavesNulas(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(removerChavesNulas);
  if (valor === null || typeof valor !== 'object') return valor;

  const objeto = valor as Record<string, unknown>;
  const resultado: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(objeto)) {
    if (item !== null) resultado[chave] = removerChavesNulas(item);
  }
  return resultado;
}

export async function executarToolCall(
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

  const validacao = tool.schema.safeParse(removerChavesNulas(argumentosBrutos));
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
    const retorno = await tool.handler(validacao.data, ctx);
    const { texto, imagem, documento } = extrairResultadoTool(retorno);
    return { tipo: 'executado', conteudo: texto, imagem, documento, argumentos: validacao.data };
  } catch (erro) {
    const mensagemErro = erro instanceof Error ? erro.message : String(erro);
    return {
      tipo: 'executado',
      conteudo: `Erro ao executar ${tool.name}: ${mensagemErro}`,
      argumentos: validacao.data,
    };
  }
}
