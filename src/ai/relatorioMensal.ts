import type OpenAI from 'openai';
import type { DbClient } from '../db/client.js';
import { obterModeloRoteamento } from '../db/repositories/roteamentoTarefas.js';
import type { AgregacaoFinanceira } from '../relatorios/financeiro.js';
import type { AgregacaoUsoIa } from '../relatorios/usoIa.js';

// Modelo próprio pro fluxo de relatório mensal, isolado de MODELO_PADRAO —
// usado como fallback quando roteamento_tarefas não tem linha pro fluxo
// ainda (mesmo padrão de MODELO_RESUMO em resumirContexto.ts).
export const MODELO_RELATORIO_MENSAL = 'openai/gpt-4o-mini';

export const FLUXO_RELATORIO_MENSAL = 'relatorio_mensal';

// Mesma regra já usada em resumirContexto.ts (Fase 4): todo número que
// aparece no texto final vem pré-calculado e injetado no prompt como dado
// estruturado — o modelo nunca soma, nunca calcula percentual, só narra.
const PROMPT_RELATORIO_MENSAL = `Você narra o relatório financeiro mensal de um bot financeiro pessoal. Todos os números abaixo já foram calculados pelo sistema — nunca some, subtraia, calcule percentual ou invente qualquer valor novo, mesmo que pareça óbvio. Escreva um resumo em prosa curto (3 a 5 frases), destacando o que mais chama atenção (categoria de maior gasto, se o saldo do mês foi positivo ou negativo, se o custo de IA subiu ou caiu em relação ao mês anterior), usando só os números fornecidos no JSON a seguir.`;

export type DadosParaResumoMensal = {
  inicio: string;
  fim: string;
  financeiro: AgregacaoFinanceira;
  usoIa: AgregacaoUsoIa;
  financeiroAnterior: AgregacaoFinanceira;
  usoIaAnterior: AgregacaoUsoIa;
};

export type ResultadoResumoMensal = {
  resumoTexto: string;
  tokensPrompt: number;
  tokensCompletion: number;
};

function montarPromptDados(dados: DadosParaResumoMensal): string {
  return JSON.stringify(
    {
      periodo: { inicio: dados.inicio, fim: dados.fim },
      financeiroDoMes: dados.financeiro,
      usoIaDoMes: dados.usoIa,
      financeiroDoMesAnterior: dados.financeiroAnterior,
      usoIaDoMesAnterior: dados.usoIaAnterior,
    },
    null,
    2,
  );
}

export async function gerarResumoMensal(
  client: OpenAI,
  dados: DadosParaResumoMensal,
  modelo: string = MODELO_RELATORIO_MENSAL,
): Promise<ResultadoResumoMensal> {
  const completion = await client.chat.completions.create({
    model: modelo,
    messages: [
      { role: 'system', content: PROMPT_RELATORIO_MENSAL },
      { role: 'user', content: montarPromptDados(dados) },
    ],
  });

  return {
    resumoTexto: completion.choices[0]?.message?.content ?? '',
    tokensPrompt: completion.usage?.prompt_tokens ?? 0,
    tokensCompletion: completion.usage?.completion_tokens ?? 0,
  };
}

export function resolverModeloRelatorioMensal(db: DbClient): string {
  return obterModeloRoteamento(db, FLUXO_RELATORIO_MENSAL) ?? MODELO_RELATORIO_MENSAL;
}
