import type OpenAI from 'openai';
import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import { contarErrosPeriodo } from '../../db/repositories/errosExecucao.js';
import { agregarFinanceiroPeriodo } from '../../relatorios/financeiro.js';
import { formatarRelatorio } from '../../relatorios/formatar.js';
import { montarImagemRelatorioSemanal } from '../../relatorios/imagemSemanal.js';
import { calcularJanelaPeriodo } from '../../relatorios/janela.js';
import { gerarRelatorioMensalCompleto } from '../../relatorios/relatorioMensalCompleto.js';
import { agregarUsoIaPeriodo } from '../../relatorios/usoIa.js';
import type { ToolDefinition } from './types.js';

const schemaRelatorio = z.object({
  periodo: z.enum(['dia', 'semana', 'mes']),
});

// periodo="semana"/"mes" mandam a mesma imagem/PDF que os jobs automáticos
// (segunda/dia 1) mandariam — a pedido explícito do usuário (2026-09-22):
// pedir pelo chat também deve trazer a versão em mídia, não só texto.
// periodo="dia" não tem equivalente de mídia no plano (Fase 9 só cobre
// semanal/mensal) — continua em texto completo, sem mudança.
export function criarToolRelatorio(client: OpenAI, db: DbClient): ToolDefinition {
  return {
    name: 'relatorio',
    description:
      'periodo="dia" (dia de hoje) devolve o relatório completo em TEXTO — repasse por completo na resposta final, incluindo "Por conta" e "Uso de IA" inteiras, sem resumir. periodo="semana" (semana atual, segunda a domingo) já ENVIA uma imagem-resumo diretamente ao chat (números principais + gráfico de despesa por categoria) — você só recebe uma confirmação curta, nunca tente recriar o conteúdo da imagem em texto. periodo="mes" (mês atual inteiro) já ENVIA um PDF completo diretamente ao chat (financeiro e uso de IA detalhados, gráficos, resumo narrado) — mesma coisa, não recrie o conteúdo em texto, só confirme brevemente que foi enviado. Sempre disponível sob demanda — chame direto quando o usuário pedir um resumo/relatório geral, sem perguntar qual período (a menos que ele já não tenha dito) nem qual conta (este relatório já traz todas).',
    schema: schemaRelatorio,
    handler: async (args) => {
      const { periodo } = args as z.infer<typeof schemaRelatorio>;

      if (periodo === 'semana') {
        const imagem = await montarImagemRelatorioSemanal(db);
        return { texto: 'Relatório semanal (imagem) enviado ao chat.', imagem };
      }

      if (periodo === 'mes') {
        const { buffer, nomeArquivo } = await gerarRelatorioMensalCompleto(db, client);
        return { texto: 'Relatório mensal (PDF) enviado ao chat.', documento: { buffer, nomeArquivo } };
      }

      const janela = calcularJanelaPeriodo(periodo);
      const financeiro = agregarFinanceiroPeriodo(db, janela);
      const usoIa = agregarUsoIaPeriodo(db, janela);
      const errosTecnicos = contarErrosPeriodo(db, janela);

      return formatarRelatorio({ inicio: janela.inicio, fim: janela.fim, financeiro, usoIa, errosTecnicos });
    },
  };
}
