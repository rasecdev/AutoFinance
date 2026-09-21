import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import { encontrarParcelaCorrespondente } from '../../db/repositories/correspondenciaFaturaParcela.js';
import { obterDivida } from '../../db/repositories/dividas.js';
import { atualizarParcelaEmail, criarParcelaEmail } from '../../db/repositories/parcelas.js';
import type { ToolDefinition } from './types.js';

const schemaRegistrarParcelaEmail = z.object({
  divida_id: z.number().int().positive(),
  numero_parcela: z.number().int().positive().optional(),
  valor: z.number().positive(),
  data_vencimento: z.string().min(1),
  trace_id: z.string().min(1),
});

type ArgsRegistrarParcelaEmail = z.infer<typeof schemaRegistrarParcelaEmail>;

// Sempre requerConfirmacao: true, mesmo princípio de registrar_fatura_email —
// conteúdo externo não confiável nunca escreve sem confirmação explícita.
export function criarToolRegistrarParcelaEmail(db: DbClient): ToolDefinition {
  return {
    name: 'registrar_parcela_email',
    description:
      'Registra ou atualiza uma parcela de dívida a partir de dado extraído de e-mail (dívida já resolvida) — atualiza a parcela correspondente se achou (por número, ou por aproximação de valor/data), cria uma nova se não achou e o número foi informado. Sempre grava origem="email" e o trace_id da extração.',
    schema: schemaRegistrarParcelaEmail,
    requerConfirmacao: true,
    resumoConfirmacao: (args) => {
      const { divida_id, numero_parcela, valor, data_vencimento } = args as ArgsRegistrarParcelaEmail;
      const divida = obterDivida(db, divida_id);
      const parteDivida = divida ? `"${divida.descricao ?? divida.tipo}"` : `#${divida_id}`;
      const parteNumero = numero_parcela !== undefined ? `parcela ${numero_parcela}` : 'a parcela correspondente';
      return `registrar ${parteNumero} da dívida ${parteDivida}, valor R$ ${valor.toFixed(2)}, vencimento ${data_vencimento}`;
    },
    avisoConfirmacao: (args) => {
      const { divida_id, numero_parcela, valor, data_vencimento } = args as ArgsRegistrarParcelaEmail;
      const resultado = encontrarParcelaCorrespondente(db, {
        dividaId: divida_id,
        numeroParcela: numero_parcela,
        valor,
        dataVencimento: data_vencimento,
      });

      if (resultado.tipo === 'encontrada') {
        return `Vai ATUALIZAR a parcela ${resultado.parcela.numeroParcela} já cadastrada (valor atual R$ ${resultado.parcela.valor.toFixed(2)} → novo valor R$ ${valor.toFixed(2)}, vencimento ${data_vencimento}).`;
      }
      if (resultado.tipo === 'ambigua') {
        return `Achei ${resultado.candidatas.length} parcelas pendentes parecidas com essa (valor/data) — ambíguo, não vou adivinhar qual. Confirme só se tiver certeza do número da parcela.`;
      }
      return numero_parcela !== undefined
        ? `Não achei parcela cadastrada correspondente — vai CRIAR a parcela ${numero_parcela} nova de R$ ${valor.toFixed(2)}.`
        : 'Não achei parcela cadastrada correspondente, e não veio o número da parcela — não dá pra criar sem saber qual número.';
    },
    handler: async (args, _ctx) => {
      const { divida_id, numero_parcela, valor, data_vencimento, trace_id } = args as ArgsRegistrarParcelaEmail;

      const resultado = encontrarParcelaCorrespondente(db, {
        dividaId: divida_id,
        numeroParcela: numero_parcela,
        valor,
        dataVencimento: data_vencimento,
      });

      if (resultado.tipo === 'encontrada') {
        atualizarParcelaEmail(db, resultado.parcela.id, { valor, dataVencimento: data_vencimento, traceId: trace_id });
        return `Parcela ${resultado.parcela.numeroParcela} atualizada pra R$ ${valor.toFixed(2)}, vencimento ${data_vencimento}.`;
      }

      if (resultado.tipo === 'ambigua') {
        return `Não gravei nada — ${resultado.candidatas.length} parcelas pendentes batem com valor/data e não dá pra saber qual é. Informe o número da parcela.`;
      }

      if (numero_parcela === undefined) {
        return 'Não gravei nada — não achei parcela correspondente e não veio o número da parcela pra criar uma nova.';
      }

      criarParcelaEmail(db, {
        dividaId: divida_id,
        numeroParcela: numero_parcela,
        valor,
        dataVencimento: data_vencimento,
        traceId: trace_id,
      });
      return `Parcela ${numero_parcela} criada: R$ ${valor.toFixed(2)}, vencimento ${data_vencimento}.`;
    },
  };
}
