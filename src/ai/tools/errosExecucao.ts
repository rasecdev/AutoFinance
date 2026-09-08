import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import { listarErros } from '../../db/repositories/errosExecucao.js';
import { calcularJanelaPeriodo } from '../../relatorios/janela.js';
import type { ToolDefinition } from './types.js';

const schemaListarErros = z.object({
  periodo: z.enum(['dia', 'semana', 'mes']),
});

export function criarToolListarErros(db: DbClient): ToolDefinition {
  return {
    name: 'listar_erros',
    description:
      'Lista os erros técnicos registrados (job de fundo que falhou — backup, monitoramento de preço, relatório semanal/mensal) no período. periodo="dia" é o dia de hoje, "semana" é a semana atual (segunda a domingo), "mes" é o mês atual inteiro. Chame quando o usuário perguntar se teve algum erro/problema técnico recentemente.',
    schema: schemaListarErros,
    handler: async (args) => {
      const { periodo } = args as z.infer<typeof schemaListarErros>;

      const janela = calcularJanelaPeriodo(periodo);
      const erros = listarErros(db, janela);

      if (erros.length === 0) {
        return `Nenhum erro técnico registrado no período (${janela.inicio} a ${janela.fim}).`;
      }

      const linhas = erros.map((erro) => `- [${erro.dataHora}] ${erro.contexto}: ${erro.mensagem}`);
      return `Erros técnicos no período (${janela.inicio} a ${janela.fim}):\n${linhas.join('\n')}`;
    },
  };
}
