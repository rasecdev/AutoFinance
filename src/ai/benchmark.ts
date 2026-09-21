import type OpenAI from 'openai';
import type { DbClient } from '../db/client.js';
import {
  listarCasosTeste,
  type CasoTesteBenchmark,
  type ToolCallEsperada,
} from '../db/repositories/casosTesteBenchmark.js';
import { registrarUsoTokens } from '../db/repositories/usoTokens.js';
import { extrairComprovante, type ResultadoExtracaoComprovante } from './extracaoComprovante.js';
import { interpretarPlanilha, type TransacaoPlanilha } from './interpretacaoPlanilha.js';
import { removerChavesNulas, type UsageComCusto } from './openrouter.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { montarToolsConversa } from './tools/conversaTools.js';
import { paraDefinicaoOpenAI } from './tools/registry.js';
import { transcreverAudio } from './transcricao.js';

export const METRICA_ACURACIA_TOOL_CALLING = 'acuracia_tool_calling';

export type ResultadoBenchmarkModelo = {
  modelo: string;
  totalCasos: number;
  acertos: number;
  acuracia: number;
  custoTotal: number;
};

// Ordena as chaves de um objeto antes de serializar — sem isso, a mesma
// resposta em ordem de chave diferente no JSON daria falso negativo na
// comparação (achado antecipado no design, ver tasks/plan.md). Reaproveitado
// pela comparação de tool_calls (conversa_texto) e pela de lista de
// transações (interpretar_planilha, Fase 6 parte 14) — mesmo problema de
// "mesmo conteúdo, ordem de chave/item diferente" nos dois casos.
function normalizarObjeto(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);

  const objeto = valor as Record<string, unknown>;
  const normalizado: Record<string, unknown> = {};
  for (const chave of Object.keys(objeto).sort()) {
    normalizado[chave] = objeto[chave];
  }
  return JSON.stringify(normalizado);
}

function normalizarLista(lista: unknown[]): string {
  return JSON.stringify(lista.map(normalizarObjeto).sort());
}

type ToolCallExtraida = { nome: string; argumentos: unknown };

function normalizarToolCalls(toolCalls: ToolCallExtraida[]): string {
  return JSON.stringify(
    toolCalls
      .map((tc) => ({ nome: tc.nome, argumentos: normalizarObjeto(tc.argumentos) }))
      .sort((a, b) => a.nome.localeCompare(b.nome) || a.argumentos.localeCompare(b.argumentos)),
  );
}

function baterComEsperado(candidato: ToolCallExtraida[], esperado: ToolCallEsperada[]): boolean {
  return normalizarToolCalls(candidato) === normalizarToolCalls(esperado);
}

// Comparação de leitura_comprovante só olha os campos que o gabarito de fato
// define — um caso curado pode não especificar "descricao" (texto livre,
// difícil de prever exatamente), por exemplo, sem isso virar falso negativo.
// "categoriaSugerida" compara normalizado (case-insensitive) por ser sugestão
// da IA, não um enum fixo.
function baterComprovante(
  obtido: ResultadoExtracaoComprovante,
  esperado: Partial<ResultadoExtracaoComprovante>,
): boolean {
  return (Object.keys(esperado) as (keyof ResultadoExtracaoComprovante)[]).every((chave) => {
    const valorEsperado = esperado[chave];
    const valorObtido = obtido[chave];

    if (chave === 'categoriaSugerida' && typeof valorEsperado === 'string' && typeof valorObtido === 'string') {
      return valorObtido.trim().toLowerCase() === valorEsperado.trim().toLowerCase();
    }

    return valorObtido === valorEsperado;
  });
}

// Transcrição de voz é o único fluxo aqui onde a IA gera texto livre a
// partir de áudio (não estrutura um JSON) — comparação exata de string é
// frágil contra variação de pontuação/acentuação/maiúscula que não muda o
// sentido, normaliza antes de comparar.
function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type ResultadoAvaliacaoCaso = {
  acerto: boolean;
  tokensPrompt: number;
  tokensCompletion: number;
  custo: number;
};

// Chamada de completion NÃO-EXECUTORA: envia o mesmo prompt de sistema + o
// mesmo conjunto de ferramentas da produção (montarToolsConversa) + a
// entrada do caso como única mensagem, e só inspeciona tool_calls da
// resposta — nunca chama tool.handler. Reaproveitar gerarResposta rodaria a
// ferramenta de verdade (ex: criar_transacao) a cada rodada de teste.
async function avaliarConversaTexto(
  client: OpenAI,
  db: DbClient,
  modelo: string,
  caso: CasoTesteBenchmark,
): Promise<ResultadoAvaliacaoCaso> {
  const ferramentas = montarToolsConversa(db, client).map(paraDefinicaoOpenAI);

  const completion = await client.chat.completions.create({
    model: modelo,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: caso.entrada },
    ],
    tools: ferramentas,
    tool_choice: 'auto',
  });

  const mensagem = completion.choices[0]?.message;
  const toolCalls: ToolCallExtraida[] = (mensagem?.tool_calls ?? [])
    .filter((toolCall) => toolCall.type === 'function')
    .map((toolCall) => ({
      nome: toolCall.function.name,
      // Mesma normalização de openrouter.ts (null explícito == chave ausente)
      // — sem isso, um candidato tecnicamente correto que manda null num
      // parâmetro opcional seria marcado como erro na comparação com o
      // gabarito (que nunca tem chave com valor null).
      argumentos: removerChavesNulas(JSON.parse(toolCall.function.arguments || '{}')) as unknown,
    }));

  const usage = completion.usage as UsageComCusto | undefined;

  return {
    acerto: baterComEsperado(toolCalls, caso.saidaEsperada as ToolCallEsperada[]),
    tokensPrompt: usage?.prompt_tokens ?? 0,
    tokensCompletion: usage?.completion_tokens ?? 0,
    custo: usage?.cost ?? 0,
  };
}

// Casos de mídia (Fase 6 parte 14) sempre têm entradaArquivo — erro claro em
// vez de undefined silencioso se um caso de texto acabar cadastrado com o
// fluxo errado.
function arquivoDoCaso(caso: CasoTesteBenchmark): { buffer: Buffer; mimeType: string } {
  if (!caso.entradaArquivo) {
    throw new Error(`caso de teste ${caso.id} (fluxo "${caso.fluxo}") não tem entradaArquivo`);
  }
  return { buffer: Buffer.from(caso.entradaArquivo.base64, 'base64'), mimeType: caso.entradaArquivo.mimeType };
}

async function avaliarLeituraComprovante(
  client: OpenAI,
  _db: DbClient,
  modelo: string,
  caso: CasoTesteBenchmark,
): Promise<ResultadoAvaliacaoCaso> {
  const { buffer, mimeType } = arquivoDoCaso(caso);
  const { resultado, tokensPrompt, tokensCompletion, custoReal } = await extrairComprovante(
    client,
    buffer,
    mimeType,
    modelo,
  );

  return {
    acerto: baterComprovante(resultado, caso.saidaEsperada as Partial<ResultadoExtracaoComprovante>),
    tokensPrompt,
    tokensCompletion,
    custo: custoReal,
  };
}

// Achado real de teste manual (Tarefa 110, contra openai/gpt-4o-mini): a
// mesma planilha/mesmo dado, extração correta, mas "categoria" (e
// "descricao") variam de forma legítima entre chamadas — o modelo infere
// "Supermercado"/"transporte"/"alimentação" onde o gabarito diz
// "Mercado"/"Transporte"/"Restaurante", sem estar "errado" de verdade
// (é campo de texto livre inferido, não um dado que a planilha traz pronto).
// Comparar só o que a planilha realmente determina (tipo/valor/data) evita
// falso negativo nesse tipo de variação — mesmo princípio já usado em
// leitura_comprovante (compara só os campos que o gabarito de fato define).
function paraComparacaoPlanilha(transacoes: TransacaoPlanilha[]): Array<Pick<TransacaoPlanilha, 'tipo' | 'valor' | 'data'>> {
  return transacoes.map(({ tipo, valor, data }) => ({ tipo, valor, data }));
}

async function avaliarInterpretarPlanilha(
  client: OpenAI,
  _db: DbClient,
  modelo: string,
  caso: CasoTesteBenchmark,
): Promise<ResultadoAvaliacaoCaso> {
  const { buffer } = arquivoDoCaso(caso);
  const { transacoes, tokensPrompt, tokensCompletion, custoReal } = await interpretarPlanilha(client, buffer, modelo);

  return {
    acerto:
      normalizarLista(paraComparacaoPlanilha(transacoes)) ===
      normalizarLista(paraComparacaoPlanilha(caso.saidaEsperada as TransacaoPlanilha[])),
    tokensPrompt,
    tokensCompletion,
    custo: custoReal,
  };
}

const EXTENSAO_POR_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
};

async function avaliarTranscricaoVoz(
  client: OpenAI,
  _db: DbClient,
  modelo: string,
  caso: CasoTesteBenchmark,
): Promise<ResultadoAvaliacaoCaso> {
  const { buffer, mimeType } = arquivoDoCaso(caso);
  const extensao = EXTENSAO_POR_MIME[mimeType] ?? 'mp3';
  const { texto, custoEstimado } = await transcreverAudio(client, buffer, `audio.${extensao}`, modelo);

  return {
    acerto: normalizarTexto(texto) === normalizarTexto(caso.saidaEsperada as string),
    // Whisper é cobrado por segundo de áudio, não por token (mesma limitação
    // já documentada em transcricao.ts) — sem tokensPrompt/tokensCompletion
    // reais pra registrar aqui.
    tokensPrompt: 0,
    tokensCompletion: 0,
    custo: custoEstimado,
  };
}

type EstrategiaAvaliacao = (
  client: OpenAI,
  db: DbClient,
  modelo: string,
  caso: CasoTesteBenchmark,
) => Promise<ResultadoAvaliacaoCaso>;

const ESTRATEGIAS: Record<string, EstrategiaAvaliacao> = {
  conversa_texto: avaliarConversaTexto,
  leitura_comprovante: avaliarLeituraComprovante,
  interpretar_planilha: avaliarInterpretarPlanilha,
  transcricao_voz: avaliarTranscricaoVoz,
};

export async function executarBenchmarkFluxo(
  client: OpenAI,
  db: DbClient,
  fluxo: string,
  modelosCandidatos: string[],
): Promise<ResultadoBenchmarkModelo[]> {
  const estrategia = ESTRATEGIAS[fluxo];
  if (!estrategia) {
    throw new Error(`fluxo desconhecido pro benchmark interno: "${fluxo}"`);
  }

  const casos = listarCasosTeste(db, fluxo);
  const resultados: ResultadoBenchmarkModelo[] = [];

  for (const modelo of modelosCandidatos) {
    let acertos = 0;
    let custoTotal = 0;

    for (const caso of casos) {
      const avaliacao = await estrategia(client, db, modelo, caso);
      custoTotal += avaliacao.custo;

      if (avaliacao.acerto) {
        acertos++;
      }

      // Custo do teste é uso real de IA, mas nunca conta como uso operacional
      // do bot — origem 'benchmark_interno' já é filtrada fora do relatório
      // de uso de IA (agregarUsoIaPeriodo, Fase 6 parte 1).
      registrarUsoTokens(db, {
        fluxo,
        modelo,
        tokensPrompt: avaliacao.tokensPrompt,
        tokensCompletion: avaliacao.tokensCompletion,
        custoEstimado: avaliacao.custo,
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
