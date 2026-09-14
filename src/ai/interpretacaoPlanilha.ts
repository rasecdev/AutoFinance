import readXlsxFile from 'read-excel-file/node';
import type OpenAI from 'openai';
import { z } from 'zod';
import type { DbClient } from '../db/client.js';
import { obterModeloRoteamento } from '../db/repositories/roteamentoTarefas.js';
import type { UsageComCusto } from './openrouter.js';

// Mesmo modelo-texto barato já usado em fluxos de análise/resumo (não é caso
// de visão, não precisa do modelo de imagem usado em leitura_comprovante) —
// mesmo padrão de MODELO_ANALISAR_QUALIDADE/MODELO_RESUMO.
export const MODELO_INTERPRETAR_PLANILHA = 'openai/gpt-4o-mini';

export const FLUXO_INTERPRETAR_PLANILHA = 'interpretar_planilha';

// Limite de linhas processadas por chamada — planilha maior que isso é
// truncada, resultado sinaliza o corte (ver tasks/plan.md, risco de estourar
// contexto da chamada de interpretação).
const LIMITE_LINHAS_PROCESSADAS = 500;

const schemaTransacaoPlanilha = z.object({
  tipo: z.enum(['receita', 'despesa']),
  valor: z.number().positive(),
  categoria: z.string().min(1),
  descricao: z.string().optional(),
  data: z.string().min(1),
});

const schemaResultadoInterpretacao = z.object({
  transacoes: z.array(schemaTransacaoPlanilha),
});

export type TransacaoPlanilha = z.infer<typeof schemaTransacaoPlanilha>;

export type ResultadoInterpretacaoPlanilha = {
  transacoes: TransacaoPlanilha[];
  linhasTruncadas: boolean;
  tokensPrompt: number;
  tokensCompletion: number;
  custoReal: number;
};

const PROMPT_INTERPRETACAO = `Você recebe dados de uma planilha (cabeçalhos + linhas) exportada de um banco ou controle financeiro pessoal, e identifica quais linhas representam transações financeiras (receita ou despesa). Responda APENAS com um JSON válido, sem markdown, sem texto antes ou depois, no formato exato:
{"transacoes": [{"tipo": "receita" | "despesa", "valor": number, "categoria": string, "descricao": string, "data": "AAAA-MM-DD"}]}

Regras:
- Mapeie as colunas pelo significado, não pelo nome exato — cada planilha nomeia diferente (ex: "Histórico"/"Descrição"/"Lançamento" são a mesma coisa; "Valor (R$)"/"Montante" são a mesma coisa).
- "valor" é sempre positivo — o sinal (receita/despesa) vem de uma coluna de tipo, de um valor negativo na planilha, ou do contexto (ex: "Débito"/"Crédito").
- "categoria" é uma categoria curta em português, inferida da descrição quando a planilha não tiver uma coluna de categoria própria.
- "data" no formato AAAA-MM-DD.
- Linhas que não são transações (cabeçalho repetido, linha de saldo/total, linha em branco) devem ser ignoradas, não incluídas na lista.
- Se nenhuma linha parecer ser uma transação financeira de verdade, responda {"transacoes": []}.
- Nunca invente valor ou data que não estejam na planilha.`;

function extrairJson(conteudo: string): unknown {
  const semCercaMarkdown = conteudo.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(semCercaMarkdown);
}

function montarPromptDados(linhas: unknown[][]): string {
  return JSON.stringify({ cabecalho: linhas[0] ?? [], linhas: linhas.slice(1) });
}

export async function interpretarPlanilha(
  client: OpenAI,
  buffer: Buffer,
  modelo: string = MODELO_INTERPRETAR_PLANILHA,
): Promise<ResultadoInterpretacaoPlanilha> {
  const planilha = await readXlsxFile(buffer);
  const todasLinhas = planilha[0]?.data ?? [];
  const linhasTruncadas = todasLinhas.length > LIMITE_LINHAS_PROCESSADAS + 1;
  const linhas = linhasTruncadas ? todasLinhas.slice(0, LIMITE_LINHAS_PROCESSADAS + 1) : todasLinhas;

  const completion = await client.chat.completions.create({
    model: modelo,
    messages: [
      { role: 'system', content: PROMPT_INTERPRETACAO },
      { role: 'user', content: montarPromptDados(linhas) },
    ],
  });

  const tokensPrompt = completion.usage?.prompt_tokens ?? 0;
  const tokensCompletion = completion.usage?.completion_tokens ?? 0;
  const custoReal = (completion.usage as UsageComCusto | undefined)?.cost ?? 0;

  const conteudo = completion.choices[0]?.message?.content ?? '';

  try {
    const bruto = extrairJson(conteudo);
    const validacao = schemaResultadoInterpretacao.safeParse(bruto);
    if (!validacao.success) {
      return { transacoes: [], linhasTruncadas, tokensPrompt, tokensCompletion, custoReal };
    }
    return { transacoes: validacao.data.transacoes, linhasTruncadas, tokensPrompt, tokensCompletion, custoReal };
  } catch {
    return { transacoes: [], linhasTruncadas, tokensPrompt, tokensCompletion, custoReal };
  }
}

export function resolverModeloInterpretarPlanilha(db: DbClient): string {
  return obterModeloRoteamento(db, FLUXO_INTERPRETAR_PLANILHA) ?? MODELO_INTERPRETAR_PLANILHA;
}
