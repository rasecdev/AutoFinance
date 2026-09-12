import type OpenAI from 'openai';
import type { DbClient } from '../db/client.js';
import { obterModeloRoteamento } from '../db/repositories/roteamentoTarefas.js';
import type { AgregacaoQualidade } from '../relatorios/qualidade.js';
import type { UsageComCusto } from './openrouter.js';

// Modelo próprio pro fluxo de análise de qualidade, isolado de MODELO_PADRAO
// — usado como fallback quando roteamento_tarefas não tem linha pro fluxo
// ainda (mesmo padrão de MODELO_RESUMO/MODELO_RELATORIO_MENSAL).
export const MODELO_ANALISAR_QUALIDADE = 'openai/gpt-4o-mini';

export const FLUXO_ANALISAR_QUALIDADE = 'analisar_qualidade';

// Mesma regra já usada em relatorioMensal.ts/resumirContexto.ts: todo número
// que aparece no texto final vem pré-calculado e injetado no prompt como
// dado estruturado — o modelo nunca soma, nunca calcula percentual/taxa,
// só narra. Só recebe métricas agregadas (contagens/taxas), nunca conteúdo
// bruto de conversa nem detalhe de erro técnico.
const PROMPT_ANALISAR_QUALIDADE = `Você analisa a qualidade das respostas de um bot financeiro pessoal baseado em IA, a partir de métricas agregadas — nunca conteúdo de conversa. Todos os números abaixo já foram calculados pelo sistema — nunca some, subtraia, calcule percentual ou invente qualquer valor novo, mesmo que pareça óbvio. Escreva uma análise em prosa curta (3 a 5 frases), destacando: qual fluxo/modelo teve mais correção manual (taxa de "incorretas" sobre "total" em porFluxoModelo) ou mais erro técnico (erroPorContexto), se a situação piorou ou melhorou em relação ao período anterior, e uma sugestão de ação quando fizer sentido (ex: revisar o roteamento de um fluxo problemático). Se não houver dado suficiente em nenhum dos dois períodos, diga isso claramente em vez de inventar uma conclusão.`;

export type DadosParaAnaliseQualidade = {
  inicio: string;
  fim: string;
  atual: AgregacaoQualidade;
  anterior: AgregacaoQualidade;
};

export type ResultadoAnaliseQualidade = {
  analiseTexto: string;
  tokensPrompt: number;
  tokensCompletion: number;
  custoReal: number;
};

function montarPromptDados(dados: DadosParaAnaliseQualidade): string {
  return JSON.stringify(
    {
      periodo: { inicio: dados.inicio, fim: dados.fim },
      qualidadeDoPeriodo: dados.atual,
      qualidadeDoPeriodoAnterior: dados.anterior,
    },
    null,
    2,
  );
}

export async function gerarAnaliseQualidade(
  client: OpenAI,
  dados: DadosParaAnaliseQualidade,
  modelo: string = MODELO_ANALISAR_QUALIDADE,
): Promise<ResultadoAnaliseQualidade> {
  const completion = await client.chat.completions.create({
    model: modelo,
    messages: [
      { role: 'system', content: PROMPT_ANALISAR_QUALIDADE },
      { role: 'user', content: montarPromptDados(dados) },
    ],
  });

  return {
    analiseTexto: completion.choices[0]?.message?.content ?? '',
    tokensPrompt: completion.usage?.prompt_tokens ?? 0,
    tokensCompletion: completion.usage?.completion_tokens ?? 0,
    custoReal: (completion.usage as UsageComCusto | undefined)?.cost ?? 0,
  };
}

export function resolverModeloAnalisarQualidade(db: DbClient): string {
  return obterModeloRoteamento(db, FLUXO_ANALISAR_QUALIDADE) ?? MODELO_ANALISAR_QUALIDADE;
}
