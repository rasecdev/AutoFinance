import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import { obterConta } from '../../db/repositories/contas.js';
import { criarDivida } from '../../db/repositories/dividas.js';
import { resolverContaId } from './resolucao.js';
import type { ToolDefinition } from './types.js';

const schemaCriarDivida = z
  .object({
    conta_id: z.number().int().positive().optional(),
    conta_apelido: z.string().min(1).optional(),
    tipo: z.enum(['emprestimo', 'financiamento', 'consignado', 'outro']),
    valor_total: z.number().positive(),
    num_parcelas: z.number().int().positive(),
    taxa_juros: z.number().min(0).optional(),
    sistema_amortizacao: z.enum(['price', 'sac']).optional(),
    indexador: z.enum(['fixo', 'ipca', 'cdi', 'selic', 'tr', 'outro']).optional(),
    taxa_indexador_spread: z.number().optional(),
    periodicidade_reajuste: z.enum(['mensal', 'anual', 'nenhuma']).optional(),
    data_inicio: z.string().min(1).optional(),
  })
  .refine((valor) => valor.conta_id !== undefined || valor.conta_apelido !== undefined, {
    message: 'Informe a conta (id ou apelido).',
  });

function hojeISO(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function criarToolCriarDivida(db: DbClient): ToolDefinition {
  return {
    name: 'criar_divida',
    description:
      'Registra uma dívida (empréstimo, financiamento ou consignado) e já gera todas as parcelas de uma vez, com data de vencimento calculada a partir de data_inicio (mensal, primeira parcela um mês depois). Assim que o usuário informar tipo, valor total, número de parcelas e a conta vinculada, chame esta ferramenta diretamente — a conta é resolvida pelo nome/apelido, e data_inicio, quando omitida, usa a data de hoje. sistema_amortizacao (price/sac), taxa_juros, indexador e demais campos são opcionais: sem sistema_amortizacao informado, as parcelas saem em valor fixo (total dividido igualmente), sem tentar aplicar juros compostos. Ação de alto impacto — só executa após confirmação.',
    schema: schemaCriarDivida,
    requerConfirmacao: true,
    handler: async (args) => {
      const {
        conta_id: contaIdInformado,
        conta_apelido: contaApelido,
        tipo,
        valor_total: valorTotal,
        num_parcelas: numParcelas,
        taxa_juros: taxaJuros,
        sistema_amortizacao: sistemaAmortizacao,
        indexador,
        taxa_indexador_spread: taxaIndexadorSpread,
        periodicidade_reajuste: periodicidadeReajuste,
        data_inicio: dataInicioInformada,
      } = args as z.infer<typeof schemaCriarDivida>;

      const resolucaoConta = resolverContaId(db, contaIdInformado, contaApelido);
      if (!resolucaoConta.ok) return resolucaoConta.mensagem;

      const dataInicio = dataInicioInformada ?? hojeISO();

      const { divida, parcelas } = criarDivida(db, {
        contaId: resolucaoConta.id,
        tipo,
        valorTotal,
        numParcelas,
        taxaJuros,
        sistemaAmortizacao,
        indexador,
        taxaIndexadorSpread,
        periodicidadeReajuste,
        dataInicio,
      });

      const conta = obterConta(db, resolucaoConta.id);
      const primeiraParcela = parcelas[0]?.valor ?? divida.valorParcela;
      const parteValor =
        divida.sistemaAmortizacao === 'sac'
          ? `parcela inicial de R$ ${primeiraParcela.toFixed(2)} (decrescente)`
          : `parcelas de R$ ${primeiraParcela.toFixed(2)}`;
      const parteSistema = divida.sistemaAmortizacao ? ` (sistema ${divida.sistemaAmortizacao})` : '';
      const parteJuros = divida.taxaJuros ? `, taxa ${(divida.taxaJuros * 100).toFixed(2)}% a.m.` : '';

      return `Dívida registrada: ${divida.tipo}, R$ ${divida.valorTotal.toFixed(2)} em ${divida.numParcelas} parcelas, ${parteValor}${parteSistema}${parteJuros}, início ${divida.dataInicio}, conta "${conta?.apelido ?? 'desconhecida'}".`;
    },
  };
}
