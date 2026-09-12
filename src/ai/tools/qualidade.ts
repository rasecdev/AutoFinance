import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type OpenAI from 'openai';
import { FLUXO_ANALISAR_QUALIDADE, gerarAnaliseQualidade, resolverModeloAnalisarQualidade } from '../analisarQualidade.js';
import type { DbClient } from '../../db/client.js';
import { registrarAnaliseQualidade } from '../../db/repositories/analisesQualidade.js';
import { registrarInteracaoIa } from '../../db/repositories/interacoesIa.js';
import { registrarUsoTokens } from '../../db/repositories/usoTokens.js';
import { calcularJanelaAnterior, calcularJanelaPeriodo } from '../../relatorios/janela.js';
import { agregarQualidadePeriodo } from '../../relatorios/qualidade.js';
import type { ToolDefinition } from './types.js';

const schemaAnalisarQualidade = z.object({
  periodo: z.enum(['dia', 'semana', 'mes']),
});

export function criarToolAnalisarQualidade(client: OpenAI, db: DbClient): ToolDefinition {
  return {
    name: 'analisar_qualidade',
    description:
      'Análise via IA de como as respostas do próprio bot estão indo — taxa de correção manual por fluxo/modelo e contagem de erro técnico por contexto, comparado com o período anterior, com sugestão de ação. Diferente de relatorio(periodo) (só contagem bruta, sem explicação): aqui a IA analisa o PORQUÊ. Chame quando o usuário perguntar algo como "como estão as respostas da IA", "teve muito erro ultimamente", "a qualidade caiu esse mês" ou pedir uma análise/diagnóstico da IA em si (não do financeiro). periodo="dia"/"semana"/"mes", mesmo significado de relatorio(periodo). Só roda sob demanda — nunca chame por conta própria fora de um pedido explícito.',
    schema: schemaAnalisarQualidade,
    handler: async (args) => {
      const { periodo } = args as z.infer<typeof schemaAnalisarQualidade>;

      const janela = calcularJanelaPeriodo(periodo);
      const janelaAnterior = calcularJanelaAnterior(periodo, janela);

      const atual = agregarQualidadePeriodo(db, janela);
      const anterior = agregarQualidadePeriodo(db, janelaAnterior);

      const modelo = resolverModeloAnalisarQualidade(db);
      const resultado = await gerarAnaliseQualidade(
        client,
        { inicio: janela.inicio, fim: janela.fim, atual, anterior },
        modelo,
      );

      registrarInteracaoIa(db, {
        traceId: randomUUID(),
        fluxo: FLUXO_ANALISAR_QUALIDADE,
        modelo,
        respostaModelo: resultado.analiseTexto,
        resultado: 'sucesso',
        tokensPrompt: resultado.tokensPrompt,
        tokensCompletion: resultado.tokensCompletion,
      });

      registrarUsoTokens(db, {
        fluxo: FLUXO_ANALISAR_QUALIDADE,
        modelo,
        tokensPrompt: resultado.tokensPrompt,
        tokensCompletion: resultado.tokensCompletion,
        custoEstimado: resultado.custoReal,
        origem: 'uso_real',
      });

      registrarAnaliseQualidade(db, {
        periodo: `${janela.inicio}_${janela.fim}`,
        conteudoGerado: resultado.analiseTexto,
      });

      return resultado.analiseTexto;
    },
  };
}
