import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import { contarErrosPeriodo } from '../../db/repositories/errosExecucao.js';
import { agregarFinanceiroPeriodo } from '../../relatorios/financeiro.js';
import { formatarRelatorio } from '../../relatorios/formatar.js';
import { calcularJanelaPeriodo } from '../../relatorios/janela.js';
import { agregarUsoIaPeriodo } from '../../relatorios/usoIa.js';
import type { ToolDefinition } from './types.js';

const schemaRelatorio = z.object({
  periodo: z.enum(['dia', 'semana', 'mes']),
});

export function criarToolRelatorio(db: DbClient): ToolDefinition {
  return {
    name: 'relatorio',
    description:
      'Relatório completo: gastos/receitas de TODAS as contas juntas (totais consolidados por categoria, mais o total e o saldo atual discriminados conta por conta — não filtra por uma única conta; pra resumo de uma conta específica, use resumo_mensal) mais o uso de IA (tokens e custo estimado) no mesmo período. periodo="dia" é o dia de hoje, "semana" é a semana atual (segunda a domingo), "mes" é o mês atual inteiro. Sempre disponível sob demanda — chame direto quando o usuário pedir um resumo/relatório geral, sem perguntar qual período (a menos que ele já não tenha dito) nem qual conta (este relatório já traz todas). Repasse o texto retornado por completo na resposta final, incluindo a seção "Por conta" e a seção "Uso de IA" inteiras — nunca resuma, corte ou omita nenhuma seção, mesmo que o pedido do usuário tenha mencionado só a parte financeira.',
    schema: schemaRelatorio,
    handler: async (args) => {
      const { periodo } = args as z.infer<typeof schemaRelatorio>;

      const janela = calcularJanelaPeriodo(periodo);
      const financeiro = agregarFinanceiroPeriodo(db, janela);
      const usoIa = agregarUsoIaPeriodo(db, janela);
      const errosTecnicos = contarErrosPeriodo(db, janela);

      return formatarRelatorio({ inicio: janela.inicio, fim: janela.fim, financeiro, usoIa, errosTecnicos });
    },
  };
}
