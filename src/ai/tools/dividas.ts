import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import { obterConta } from '../../db/repositories/contas.js';
import { criarDivida, marcarDividaRenegociada, obterDivida, type Divida, type TipoDivida } from '../../db/repositories/dividas.js';
import { buscarFaturaPorCartaoEMes, marcarFaturaRenegociada } from '../../db/repositories/faturas.js';
import { criarRenegociacao } from '../../db/repositories/renegociacoes.js';
import { normalizarMesReferencia } from './mesReferencia.js';
import { resolverCartaoId, resolverContaId, resolverDividaId } from './resolucao.js';
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
    descricao: z.string().min(1).optional(),
  })
  .refine((valor) => valor.conta_id !== undefined || valor.conta_apelido !== undefined, {
    message: 'Informe a conta (id ou apelido).',
  });

function formatarTotalComJuros(valorTotal: number, parcelas: { valor: number }[]): string {
  const total = parcelas.reduce((soma, parcela) => soma + parcela.valor, 0);
  return total > valorTotal + 0.01 ? `, total com juros R$ ${total.toFixed(2)}` : '';
}

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
      'Registra uma dívida (empréstimo, financiamento ou consignado) e já gera todas as parcelas de uma vez, com data de vencimento calculada a partir de data_inicio (mensal, primeira parcela um mês depois). Assim que o usuário informar tipo, valor total, número de parcelas e a conta vinculada, chame esta ferramenta diretamente — a conta é resolvida pelo nome/apelido, e data_inicio, quando omitida, usa a data de hoje. sistema_amortizacao (price/sac), taxa_juros, indexador e demais campos são opcionais: sem sistema_amortizacao informado, as parcelas saem em valor fixo (total dividido igualmente), sem tentar aplicar juros compostos. descricao é opcional (ex: "Financiamento carro") — só é importante quando o usuário já tem ou pode vir a ter mais de uma dívida do mesmo tipo na mesma conta, já que dívida é sempre identificada por conta + tipo (nunca por id) em outras ferramentas. Ação de alto impacto — só executa após confirmação.',
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
        descricao,
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
        descricao,
      });

      const conta = obterConta(db, resolucaoConta.id);
      const primeiraParcela = parcelas[0]?.valor ?? divida.valorParcela;
      const parteValor =
        divida.sistemaAmortizacao === 'sac'
          ? `parcela inicial de R$ ${primeiraParcela.toFixed(2)} (decrescente)`
          : `parcelas de R$ ${primeiraParcela.toFixed(2)}`;
      const parteSistema = divida.sistemaAmortizacao ? ` (sistema ${divida.sistemaAmortizacao})` : '';
      const parteJuros = divida.taxaJuros ? `, taxa ${(divida.taxaJuros * 100).toFixed(2)}% a.m.` : '';
      const parteDescricao = divida.descricao ? ` "${divida.descricao}"` : '';
      const parteTotalComJuros = formatarTotalComJuros(divida.valorTotal, parcelas);

      return `Dívida${parteDescricao} registrada: ${divida.tipo}, R$ ${divida.valorTotal.toFixed(2)} em ${divida.numParcelas} parcelas, ${parteValor}${parteSistema}${parteJuros}${parteTotalComJuros}, início ${divida.dataInicio}, conta "${conta?.apelido ?? 'desconhecida'}".`;
    },
  };
}

const schemaRenegociar = z
  .object({
    origem: z.enum(['divida', 'fatura']),
    conta_id: z.number().int().positive().optional(),
    conta_apelido: z.string().min(1).optional(),
    tipo_divida: z.enum(['emprestimo', 'financiamento', 'consignado', 'outro']).optional(),
    divida_descricao: z.string().min(1).optional(),
    cartao_id: z.number().int().positive().optional(),
    cartao_nome: z.string().min(1).optional(),
    mes_referencia: z
      .string()
      .regex(/^(\d{4}-\d{2}|\d{1,2})$/, 'Use "AAAA-MM", ou só o mês ("8"/"08") quando o usuário não disser o ano.')
      .optional(),
    valor_total: z.number().positive(),
    num_parcelas: z.number().int().positive(),
    taxa_juros: z.number().min(0).optional(),
    sistema_amortizacao: z.enum(['price', 'sac']).optional(),
    indexador: z.enum(['fixo', 'ipca', 'cdi', 'selic', 'tr', 'outro']).optional(),
    taxa_indexador_spread: z.number().optional(),
    periodicidade_reajuste: z.enum(['mensal', 'anual', 'nenhuma']).optional(),
    data_inicio: z.string().min(1).optional(),
    descricao: z.string().min(1).optional(),
    motivo: z.string().optional(),
  })
  .refine(
    (valor) =>
      valor.origem !== 'divida' ||
      ((valor.conta_id !== undefined || valor.conta_apelido !== undefined) && valor.tipo_divida !== undefined),
    { message: 'Pra renegociar uma dívida, informe a conta (id ou apelido) e o tipo da dívida.' },
  )
  .refine(
    (valor) =>
      valor.origem !== 'fatura' ||
      ((valor.cartao_id !== undefined || valor.cartao_nome !== undefined) && valor.mes_referencia !== undefined),
    { message: 'Pra renegociar uma fatura, informe o cartão (id ou nome) e o mês de referência (AAAA-MM).' },
  );

export function criarToolRenegociar(db: DbClient): ToolDefinition {
  return {
    name: 'renegociar',
    description:
      'Renegocia uma dívida ou fatura existente: marca a origem como renegociada e cria uma nova dívida com os termos novos. valor_total e num_parcelas são sempre os valores novos, informados pelo usuário. Os demais campos (taxa_juros, sistema_amortizacao, indexador, taxa_indexador_spread, descricao) são opcionais: quando origem = "divida" e o usuário não informar um deles, a nova dívida herda o valor da dívida original automaticamente (renegociação normalmente muda só uma ou duas coisas, o resto do contrato tende a continuar igual) — não precisa perguntar isso ao usuário nem pedir pra repetir dado que não mudou. Quando origem = "fatura" não há nada pra herdar (fatura não tem esses campos). Nunca use id pra identificar a origem — dívida é identificada por conta + tipo_divida (divida_descricao só quando houver mais de uma do mesmo tipo na mesma conta e a ferramenta pedir pra desambiguar); fatura é identificada por cartão (nome/id) + mes_referencia, que aceita "AAAA-MM" quando o usuário disser o ano, ou só o mês ("8"/"08") quando ele não disser — nesse caso NUNCA invente o ano sozinho, o sistema completa com o ano atual automaticamente. A nova dívida herda o tipo da dívida original quando origem = "divida", ou usa tipo "outro" quando origem = "fatura". Ação de alto impacto — só executa após confirmação.',
    schema: schemaRenegociar,
    requerConfirmacao: true,
    handler: async (args) => {
      const {
        origem,
        conta_id: contaIdInformado,
        conta_apelido: contaApelido,
        tipo_divida: tipoDivida,
        divida_descricao: dividaDescricao,
        cartao_id: cartaoIdInformado,
        cartao_nome: cartaoNome,
        mes_referencia: mesReferencia,
        valor_total: valorTotal,
        num_parcelas: numParcelas,
        taxa_juros: taxaJuros,
        sistema_amortizacao: sistemaAmortizacao,
        indexador,
        taxa_indexador_spread: taxaIndexadorSpread,
        periodicidade_reajuste: periodicidadeReajuste,
        data_inicio: dataInicioInformada,
        descricao,
        motivo,
      } = args as z.infer<typeof schemaRenegociar>;

      let contaId: number;
      let tipoNovaDivida: TipoDivida;
      let origemId: number;
      let dividaOrigem: Divida | undefined;

      if (origem === 'divida') {
        const resolucaoConta = resolverContaId(db, contaIdInformado, contaApelido);
        if (!resolucaoConta.ok) return resolucaoConta.mensagem;

        const resolucaoDivida = resolverDividaId(db, resolucaoConta.id, tipoDivida as TipoDivida, dividaDescricao);
        if (!resolucaoDivida.ok) return resolucaoDivida.mensagem;

        contaId = resolucaoConta.id;
        tipoNovaDivida = tipoDivida as TipoDivida;
        origemId = resolucaoDivida.id;
        dividaOrigem = obterDivida(db, origemId);
      } else {
        const resolucaoCartao = resolverCartaoId(db, cartaoIdInformado, cartaoNome);
        if (!resolucaoCartao.ok) return resolucaoCartao.mensagem;

        const mesNormalizado = normalizarMesReferencia(mesReferencia as string);
        const fatura = buscarFaturaPorCartaoEMes(db, resolucaoCartao.id, mesNormalizado);
        if (!fatura) return `Não encontrei fatura de referência "${mesNormalizado}" nesse cartão.`;

        contaId = fatura.contaId;
        tipoNovaDivida = 'outro';
        origemId = fatura.id;
      }

      const dataInicio = dataInicioInformada ?? hojeISO();

      const { divida, parcelas, renegociacao } = db.transaction(() => {
        if (origem === 'divida') {
          marcarDividaRenegociada(db, origemId);
        } else {
          marcarFaturaRenegociada(db, origemId);
        }

        // Renegociação normalmente muda só uma ou duas coisas (valor, parcelas, taxa) — o
        // resto do contrato original costuma continuar igual. Campo não informado herda
        // da dívida de origem em vez de virar null silenciosamente (só se aplica quando a
        // origem é uma dívida — fatura não tem taxa_juros/sistema_amortizacao pra herdar).
        const criada = criarDivida(db, {
          contaId,
          tipo: tipoNovaDivida,
          valorTotal,
          numParcelas,
          taxaJuros: taxaJuros ?? dividaOrigem?.taxaJuros ?? undefined,
          sistemaAmortizacao: sistemaAmortizacao ?? dividaOrigem?.sistemaAmortizacao ?? undefined,
          indexador: indexador ?? dividaOrigem?.indexador,
          taxaIndexadorSpread: taxaIndexadorSpread ?? dividaOrigem?.taxaIndexadorSpread ?? undefined,
          periodicidadeReajuste: periodicidadeReajuste ?? dividaOrigem?.periodicidadeReajuste,
          dataInicio,
          descricao: descricao ?? dividaOrigem?.descricao ?? undefined,
        });

        const novaRenegociacao = criarRenegociacao(db, {
          origemTipo: origem,
          origemId,
          novaDividaId: criada.divida.id,
          motivo,
          data: hojeISO(),
        });

        return { divida: criada.divida, parcelas: criada.parcelas, renegociacao: novaRenegociacao };
      })();

      const conta = obterConta(db, contaId);
      const parteMotivo = renegociacao.motivo ? `, motivo "${renegociacao.motivo}"` : '';
      const parteDescricao = divida.descricao ? ` "${divida.descricao}"` : '';
      const parteSistema = divida.sistemaAmortizacao ? ` (sistema ${divida.sistemaAmortizacao})` : '';
      const parteJuros = divida.taxaJuros ? `, taxa ${(divida.taxaJuros * 100).toFixed(2)}% a.m.` : '';
      const parteTotalComJuros = formatarTotalComJuros(divida.valorTotal, parcelas);

      return `Renegociação registrada: ${origem === 'divida' ? 'dívida' : 'fatura'} original marcada como renegociada, nova dívida${parteDescricao} "${divida.tipo}" de R$ ${divida.valorTotal.toFixed(2)} em ${divida.numParcelas} parcelas${parteSistema}${parteJuros}${parteTotalComJuros}, início ${divida.dataInicio}, conta "${conta?.apelido ?? 'desconhecida'}"${parteMotivo}.`;
    },
  };
}
