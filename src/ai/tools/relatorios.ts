import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
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
      'Relatório de gastos/receitas e uso de IA. periodo="dia" é o dia de hoje, "semana" é a semana atual (segunda a domingo), "mes" é o mês atual inteiro. Sempre disponível sob demanda — chame direto quando o usuário pedir um resumo/relatório, sem perguntar qual período, a menos que ele já não tenha dito.',
    schema: schemaRelatorio,
    handler: async (args) => {
      const { periodo } = args as z.infer<typeof schemaRelatorio>;

      const janela = calcularJanelaPeriodo(periodo);
      const financeiro = agregarFinanceiroPeriodo(db, janela);
      const usoIa = agregarUsoIaPeriodo(db, janela);

      return formatarRelatorio({ inicio: janela.inicio, fim: janela.fim, financeiro, usoIa });
    },
  };
}
