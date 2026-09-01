import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import { incrementarParcelasPagas, type TipoDivida } from '../../db/repositories/dividas.js';
import { buscarFaturaPorCartaoEMes, marcarFaturaPaga } from '../../db/repositories/faturas.js';
import { marcarParcelaPaga, obterParcelaPorNumero, obterProximaParcelaPendente } from '../../db/repositories/parcelas.js';
import { normalizarMesReferencia } from './mesReferencia.js';
import { resolverCartaoId, resolverContaId, resolverDividaId } from './resolucao.js';
import type { ToolDefinition } from './types.js';

function hojeISO(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

const schemaPagarParcela = z
  .object({
    conta_id: z.number().int().positive().optional(),
    conta_apelido: z.string().min(1).optional(),
    tipo_divida: z.enum(['emprestimo', 'financiamento', 'consignado', 'outro']),
    divida_descricao: z.string().min(1).optional(),
    numero_parcela: z.number().int().positive().optional(),
    data_pagamento: z.string().min(1).optional(),
  })
  .refine((valor) => valor.conta_id !== undefined || valor.conta_apelido !== undefined, {
    message: 'Informe a conta (id ou apelido).',
  });

export function criarToolPagarParcela(db: DbClient): ToolDefinition {
  return {
    name: 'pagar_parcela',
    description:
      'Marca uma parcela de dívida como paga. Identifica a dívida por conta + tipo_divida (nunca por id — divida_descricao só quando houver mais de uma do mesmo tipo na mesma conta). numero_parcela é opcional: quando omitido, paga a parcela pendente mais antiga (uso de rotina, "paguei a parcela desse mês"); quando informado, paga exatamente essa parcela (antecipação fora de ordem). data_pagamento, quando omitida, usa a data de hoje. Rotina, baixo impacto — não exige confirmação.',
    schema: schemaPagarParcela,
    handler: async (args) => {
      const {
        conta_id: contaIdInformado,
        conta_apelido: contaApelido,
        tipo_divida: tipoDivida,
        divida_descricao: dividaDescricao,
        numero_parcela: numeroParcela,
        data_pagamento: dataPagamentoInformada,
      } = args as z.infer<typeof schemaPagarParcela>;

      const resolucaoConta = resolverContaId(db, contaIdInformado, contaApelido);
      if (!resolucaoConta.ok) return resolucaoConta.mensagem;

      const resolucaoDivida = resolverDividaId(db, resolucaoConta.id, tipoDivida as TipoDivida, dividaDescricao);
      if (!resolucaoDivida.ok) return resolucaoDivida.mensagem;

      const parcela =
        numeroParcela !== undefined
          ? obterParcelaPorNumero(db, resolucaoDivida.id, numeroParcela)
          : obterProximaParcelaPendente(db, resolucaoDivida.id);

      if (!parcela) {
        return numeroParcela !== undefined
          ? `Não encontrei a parcela ${numeroParcela} dessa dívida.`
          : 'Essa dívida não tem nenhuma parcela pendente.';
      }
      if (parcela.status === 'paga') {
        return `A parcela ${parcela.numeroParcela} já estava paga.`;
      }
      if (parcela.status === 'cancelada') {
        return `A parcela ${parcela.numeroParcela} foi cancelada — não é possível pagar.`;
      }

      const dataPagamento = dataPagamentoInformada ?? hojeISO();

      const divida = db.transaction(() => {
        marcarParcelaPaga(db, parcela.id, dataPagamento);
        return incrementarParcelasPagas(db, resolucaoDivida.id);
      })();

      const parteQuitada = divida.status === 'quitado' ? ' Essa foi a última parcela — dívida quitada.' : '';

      return `Parcela ${parcela.numeroParcela}/${divida.numParcelas} paga: R$ ${parcela.valor.toFixed(2)}, data ${dataPagamento}. ${divida.parcelasPagas}/${divida.numParcelas} parcelas pagas.${parteQuitada}`;
    },
  };
}

const schemaPagarFatura = z
  .object({
    cartao_id: z.number().int().positive().optional(),
    cartao_nome: z.string().min(1).optional(),
    mes_referencia: z.string().regex(/^(\d{4}-\d{2}|\d{1,2})$/, 'Use "AAAA-MM", ou só o mês ("8"/"08") quando o usuário não disser o ano.'),
    data_pagamento: z.string().min(1).optional(),
  })
  .refine((valor) => valor.cartao_id !== undefined || valor.cartao_nome !== undefined, {
    message: 'Informe o cartão (id ou nome).',
  });

export function criarToolPagarFatura(db: DbClient): ToolDefinition {
  return {
    name: 'pagar_fatura',
    description:
      'Marca a fatura de um cartão como paga. Identifica a fatura por cartão (id ou nome) + mes_referencia, nunca por id de fatura. mes_referencia aceita "AAAA-MM" quando o usuário disser o ano, ou só o mês ("8"/"08") quando ele não disser — nesse caso NUNCA invente o ano sozinho, o sistema completa com o ano atual automaticamente. data_pagamento, quando omitida, usa a data de hoje. Rotina, baixo impacto — não exige confirmação.',
    schema: schemaPagarFatura,
    handler: async (args) => {
      const {
        cartao_id: cartaoIdInformado,
        cartao_nome: cartaoNome,
        mes_referencia: mesReferenciaInformada,
        data_pagamento: dataPagamentoInformada,
      } = args as z.infer<typeof schemaPagarFatura>;

      const resolucaoCartao = resolverCartaoId(db, cartaoIdInformado, cartaoNome);
      if (!resolucaoCartao.ok) return resolucaoCartao.mensagem;

      const mesReferencia = normalizarMesReferencia(mesReferenciaInformada);
      const fatura = buscarFaturaPorCartaoEMes(db, resolucaoCartao.id, mesReferencia);
      if (!fatura) return `Não encontrei fatura de referência "${mesReferencia}" nesse cartão.`;
      if (fatura.status === 'paga') return 'Essa fatura já estava paga.';
      if (fatura.status === 'renegociada') return 'Essa fatura foi renegociada — não é possível pagar.';

      const dataPagamento = dataPagamentoInformada ?? hojeISO();
      marcarFaturaPaga(db, fatura.id, dataPagamento);

      return `Fatura de ${mesReferencia} paga: R$ ${fatura.valor.toFixed(2)}, data ${dataPagamento}.`;
    },
  };
}
