import { randomUUID } from 'node:crypto';
import type OpenAI from 'openai';
import type { DbClient } from '../db/client.js';
import {
  buscarUltimasInteracoesPorChat,
  registrarInteracaoIa,
  somarTokensChat,
  type InteracaoIa,
} from '../db/repositories/interacoesIa.js';
import { criarResumoConversa, obterUltimoResumo } from '../db/repositories/resumosConversa.js';
import { registrarUsoTokens } from '../db/repositories/usoTokens.js';

// Sem roteamento por fluxo ainda (roteamento_tarefas é Fase 5) — modelo próprio
// e mais barato pro fluxo de resumo, isolado de MODELO_PADRAO por enquanto.
export const MODELO_RESUMO = 'openai/gpt-4o-mini';

// PLANO.md sugeria ~6-8k tokens como ponto de partida ("a validar na
// prática") — validado e ajustado pra cima na Tarefa 20: uma única chamada
// de conversa já custa ~11-18k tokens sozinha (system prompt + as ~20
// definições de ferramentas dominam o custo fixo por mensagem), então 6-8k
// disparava o resumo em praticamente toda mensagem, sem deixar a janela
// curta acumular turno nenhum antes de resumir. 25000 permite acumular
// pelo menos 1-2 trocas reais antes do gatilho.
export const LIMITE_TOKENS_JANELA = 25000;

export const FLUXO_RESUMIR_CONTEXTO = 'resumir_contexto';

// "Todas as interações desde o último resumo" — sem paginação real nesse volume
// (bot pessoal, uso esporádico), um limite alto cobre a prática sem exigir uma
// função de repositório sem limite dedicada só pra este caso.
const LIMITE_INTERACOES_JANELA = 10000;

const PROMPT_RESUMO = `Você resume conversas de um bot financeiro pessoal. Gere um resumo compacto e objetivo (não uma lista, prosa corrida) da conversa a seguir, priorizando decisões tomadas, valores/contas/dívidas mencionados e pendências em aberto. Não repita o texto literal de lançamentos já registrados no banco (ex: "registrei R$ 30 em Uber") — esse dado já está salvo, não precisa sobreviver em prosa; foque no que é necessário pra entender continuidade de uma pergunta de seguimento. Se houver um resumo anterior, funda as informações dele com as mensagens novas num resumo só, sem repetir.`;

export type ResultadoResumo = {
  resumoTexto: string;
  tokensPrompt: number;
  tokensCompletion: number;
};

function formatarInteracoesParaPrompt(interacoes: InteracaoIa[]): string {
  return interacoes
    .map((interacao) => `Usuário: ${interacao.mensagemUsuario ?? ''}\nBot: ${interacao.respostaModelo ?? ''}`)
    .join('\n\n');
}

export async function resumirContexto(
  client: OpenAI,
  params: { resumoAnterior?: string; mensagensNovas: InteracaoIa[] },
): Promise<ResultadoResumo> {
  const partes: string[] = [];
  if (params.resumoAnterior) {
    partes.push(`Resumo anterior:\n${params.resumoAnterior}`);
  }
  partes.push(`Mensagens novas:\n${formatarInteracoesParaPrompt(params.mensagensNovas)}`);

  const completion = await client.chat.completions.create({
    model: MODELO_RESUMO,
    messages: [
      { role: 'system', content: PROMPT_RESUMO },
      { role: 'user', content: partes.join('\n\n') },
    ],
  });

  return {
    resumoTexto: completion.choices[0]?.message?.content ?? '',
    tokensPrompt: completion.usage?.prompt_tokens ?? 0,
    tokensCompletion: completion.usage?.completion_tokens ?? 0,
  };
}

export async function verificarGatilhoResumo(db: DbClient, client: OpenAI, chatId: number): Promise<void> {
  const resumoAtual = obterUltimoResumo(db, chatId);
  const tokensJanela = somarTokensChat(db, chatId, resumoAtual?.cobreAteTraceId);

  if (tokensJanela <= LIMITE_TOKENS_JANELA) {
    return;
  }

  const interacoesJanela = buscarUltimasInteracoesPorChat(
    db,
    chatId,
    LIMITE_INTERACOES_JANELA,
    resumoAtual?.cobreAteTraceId,
  );

  if (interacoesJanela.length === 0) {
    return;
  }

  const resultado = await resumirContexto(client, {
    resumoAnterior: resumoAtual?.resumoTexto,
    mensagensNovas: interacoesJanela,
  });

  const ultimaInteracao = interacoesJanela[interacoesJanela.length - 1];
  if (!ultimaInteracao) {
    return;
  }

  criarResumoConversa(db, {
    chatId,
    resumoTexto: resultado.resumoTexto,
    cobreAteTraceId: ultimaInteracao.traceId,
    tokensJanelaNoGatilho: tokensJanela,
  });

  registrarInteracaoIa(db, {
    traceId: randomUUID(),
    fluxo: FLUXO_RESUMIR_CONTEXTO,
    modelo: MODELO_RESUMO,
    respostaModelo: resultado.resumoTexto,
    resultado: 'sucesso',
    chatId,
    tokensPrompt: resultado.tokensPrompt,
    tokensCompletion: resultado.tokensCompletion,
  });

  registrarUsoTokens(db, {
    fluxo: FLUXO_RESUMIR_CONTEXTO,
    modelo: MODELO_RESUMO,
    tokensPrompt: resultado.tokensPrompt,
    tokensCompletion: resultado.tokensCompletion,
    custoEstimado: 0,
    origem: 'uso_real',
  });
}
