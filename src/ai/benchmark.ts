import type OpenAI from 'openai';
import type { DbClient } from '../db/client.js';
import { listarCasosTeste, type ToolCallEsperada } from '../db/repositories/casosTesteBenchmark.js';
import { registrarUsoTokens } from '../db/repositories/usoTokens.js';
import type { UsageComCusto } from './openrouter.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { montarToolsConversa } from './tools/conversaTools.js';
import { paraDefinicaoOpenAI } from './tools/registry.js';

export const METRICA_ACURACIA_TOOL_CALLING = 'acuracia_tool_calling';

export type ResultadoBenchmarkModelo = {
  modelo: string;
  totalCasos: number;
  acertos: number;
  acuracia: number;
  custoTotal: number;
};

type ToolCallExtraida = { nome: string; argumentos: unknown };

// Ordena as chaves de argumentos antes de serializar — sem isso, a mesma
// resposta em ordem de chave diferente no JSON daria falso negativo na
// comparação (achado antecipado no design, ver tasks/plan.md).
function normalizarArgumentos(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);

  const objeto = valor as Record<string, unknown>;
  const normalizado: Record<string, unknown> = {};
  for (const chave of Object.keys(objeto).sort()) {
    normalizado[chave] = objeto[chave];
  }
  return JSON.stringify(normalizado);
}

function normalizarToolCalls(toolCalls: Array<{ nome: string; argumentos: unknown }>): string {
  return JSON.stringify(
    toolCalls
      .map((tc) => ({ nome: tc.nome, argumentos: normalizarArgumentos(tc.argumentos) }))
      .sort((a, b) => a.nome.localeCompare(b.nome) || a.argumentos.localeCompare(b.argumentos)),
  );
}

function baterComEsperado(candidato: ToolCallExtraida[], esperado: ToolCallEsperada[]): boolean {
  return normalizarToolCalls(candidato) === normalizarToolCalls(esperado);
}

type RespostaModeloCandidato = {
  toolCalls: ToolCallExtraida[];
  tokensPrompt: number;
  tokensCompletion: number;
  custo: number;
};

// Chamada de completion NÃO-EXECUTORA: envia o mesmo prompt de sistema + o
// mesmo conjunto de ferramentas da produção (montarToolsConversa) + a
// entrada do caso como única mensagem, e só inspeciona tool_calls da
// resposta — nunca chama tool.handler. Reaproveitar gerarResposta rodaria a
// ferramenta de verdade (ex: criar_transacao) a cada rodada de teste.
async function chamarModeloCandidato(
  client: OpenAI,
  db: DbClient,
  modelo: string,
  entrada: string,
): Promise<RespostaModeloCandidato> {
  const ferramentas = montarToolsConversa(db, client).map(paraDefinicaoOpenAI);

  const completion = await client.chat.completions.create({
    model: modelo,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: entrada },
    ],
    tools: ferramentas,
    tool_choice: 'auto',
  });

  const mensagem = completion.choices[0]?.message;
  const toolCalls: ToolCallExtraida[] = (mensagem?.tool_calls ?? [])
    .filter((toolCall) => toolCall.type === 'function')
    .map((toolCall) => ({
      nome: toolCall.function.name,
      argumentos: JSON.parse(toolCall.function.arguments || '{}') as unknown,
    }));

  const usage = completion.usage as UsageComCusto | undefined;

  return {
    toolCalls,
    tokensPrompt: usage?.prompt_tokens ?? 0,
    tokensCompletion: usage?.completion_tokens ?? 0,
    custo: usage?.cost ?? 0,
  };
}

export async function executarBenchmarkFluxo(
  client: OpenAI,
  db: DbClient,
  fluxo: string,
  modelosCandidatos: string[],
): Promise<ResultadoBenchmarkModelo[]> {
  const casos = listarCasosTeste(db, fluxo);
  const resultados: ResultadoBenchmarkModelo[] = [];

  for (const modelo of modelosCandidatos) {
    let acertos = 0;
    let custoTotal = 0;

    for (const caso of casos) {
      const resposta = await chamarModeloCandidato(client, db, modelo, caso.entrada);
      custoTotal += resposta.custo;

      if (baterComEsperado(resposta.toolCalls, caso.saidaEsperada)) {
        acertos++;
      }

      // Custo do teste é uso real de IA, mas nunca conta como uso operacional
      // do bot — origem 'benchmark_interno' já é filtrada fora do relatório
      // de uso de IA (agregarUsoIaPeriodo, Fase 6 parte 1).
      registrarUsoTokens(db, {
        fluxo,
        modelo,
        tokensPrompt: resposta.tokensPrompt,
        tokensCompletion: resposta.tokensCompletion,
        custoEstimado: resposta.custo,
        origem: 'benchmark_interno',
      });
    }

    resultados.push({
      modelo,
      totalCasos: casos.length,
      acertos,
      acuracia: casos.length > 0 ? acertos / casos.length : 0,
      custoTotal,
    });
  }

  return resultados;
}
