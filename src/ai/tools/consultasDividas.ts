import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import { obterConta } from '../../db/repositories/contas.js';
import { buscarFaturaPorCartaoEMes } from '../../db/repositories/faturas.js';
import { listarDividasAtivas, listarParcelasPendentesDividasAtivas } from '../../db/repositories/dividas.js';
import { obterProximaParcelaPendente } from '../../db/repositories/parcelas.js';
import { normalizarMesReferencia } from './mesReferencia.js';
import { resolverCartaoId, resolverContaId } from './resolucao.js';
import type { ToolDefinition } from './types.js';

const schemaConsultarFatura = z
  .object({
    cartao_id: z.number().int().positive().optional(),
    cartao_nome: z.string().min(1).optional(),
    mes_referencia: z
      .string()
      .regex(/^(\d{4}-\d{2}|\d{1,2})$/, 'Use "AAAA-MM", ou só o mês ("8"/"08") quando o usuário não disser o ano.'),
  })
  .refine((valor) => valor.cartao_id !== undefined || valor.cartao_nome !== undefined, {
    message: 'Informe o cartão (id ou nome).',
  });

export function criarToolConsultarFatura(db: DbClient): ToolDefinition {
  return {
    name: 'consultar_fatura',
    description:
      'Consulta a fatura de um cartão num mês específico. Identifica a fatura por cartão (id ou nome) + mes_referencia, nunca por id de fatura. mes_referencia aceita "AAAA-MM" quando o usuário disser o ano, ou só o mês ("8"/"08") quando ele não disser — nesse caso NUNCA invente o ano sozinho, o sistema completa com o ano atual automaticamente. Consulta, sem efeito colateral — não exige confirmação.',
    schema: schemaConsultarFatura,
    handler: async (args) => {
      const {
        cartao_id: cartaoIdInformado,
        cartao_nome: cartaoNome,
        mes_referencia: mesReferenciaInformada,
      } = args as z.infer<typeof schemaConsultarFatura>;

      const resolucaoCartao = resolverCartaoId(db, cartaoIdInformado, cartaoNome);
      if (!resolucaoCartao.ok) return resolucaoCartao.mensagem;

      const mesReferencia = normalizarMesReferencia(mesReferenciaInformada);
      const fatura = buscarFaturaPorCartaoEMes(db, resolucaoCartao.id, mesReferencia);
      if (!fatura) return `Não encontrei fatura de referência "${mesReferencia}" nesse cartão.`;

      const parteStatus =
        fatura.status === 'paga' && fatura.dataPagamento
          ? `paga em ${fatura.dataPagamento}`
          : fatura.status === 'renegociada'
            ? 'renegociada'
            : 'em aberto';

      return `Fatura de ${mesReferencia}: R$ ${fatura.valor.toFixed(2)}, ${parteStatus}.`;
    },
  };
}

const schemaConsultarDividasAtivas = z.object({
  conta_id: z.number().int().positive().optional(),
  conta_apelido: z.string().min(1).optional(),
});

export function criarToolConsultarDividasAtivas(db: DbClient): ToolDefinition {
  return {
    name: 'consultar_dividas_ativas',
    description:
      'Lista as dívidas ativas (empréstimo, financiamento, consignado — nunca quitadas/renegociadas). Use esta ferramenta pra qualquer pedido do tipo "liste as dívidas", "quais dívidas eu tenho", "dívidas ativas" — dívida/financiamento/empréstimo NUNCA é consultar_extrato, que é só receita/despesa do dia a dia e não sabe nada sobre dívida. conta é totalmente opcional — sem conta informada, lista de todas as contas; nunca pergunte pela conta antes de chamar, chame direto. Se o usuário citar o nome/apelido da conta, use-o diretamente, mesmo que pareça um tipo de conta (ex: "PJ", "PF"). Consulta, sem efeito colateral — não exige confirmação.',
    schema: schemaConsultarDividasAtivas,
    handler: async (args) => {
      const { conta_id: contaId, conta_apelido: contaApelido } = args as z.infer<
        typeof schemaConsultarDividasAtivas
      >;

      let contaResolvidaId: number | undefined;
      let apelidoConta: string | undefined;
      if (contaId !== undefined || contaApelido !== undefined) {
        const resolucao = resolverContaId(db, contaId, contaApelido);
        if (!resolucao.ok) return resolucao.mensagem;
        contaResolvidaId = resolucao.id;
        apelidoConta = obterConta(db, resolucao.id)?.apelido;
      }

      const dividas = listarDividasAtivas(db, contaResolvidaId);
      if (dividas.length === 0) {
        return apelidoConta
          ? `Nenhuma dívida ativa na conta "${apelidoConta}".`
          : 'Nenhuma dívida ativa encontrada.';
      }

      const linhas = dividas.map((divida) => {
        const proximaParcela = obterProximaParcelaPendente(db, divida.id);
        const parteDescricao = divida.descricao ? ` "${divida.descricao}"` : '';
        const parteProxima = proximaParcela
          ? `, próxima parcela ${proximaParcela.numeroParcela}/${divida.numParcelas} de R$ ${proximaParcela.valor.toFixed(2)} vence em ${proximaParcela.dataVencimento}`
          : '';
        return `- ${divida.tipo}${parteDescricao}: R$ ${divida.valorTotal.toFixed(2)} total, ${divida.parcelasPagas}/${divida.numParcelas} parcelas pagas${parteProxima}`;
      });

      const parteConta = apelidoConta ? ` na conta "${apelidoConta}"` : '';
      return `${dividas.length} dívida(s) ativa(s)${parteConta}:\n${linhas.join('\n')}`;
    },
  };
}

const schemaResumoDividas = z.object({
  conta_id: z.number().int().positive().optional(),
  conta_apelido: z.string().min(1).optional(),
});

const MAX_PROXIMAS_PARCELAS = 5;

export function criarToolResumoDividas(db: DbClient): ToolDefinition {
  return {
    name: 'resumo_dividas',
    description:
      'Resumo agregado das dívidas ativas: saldo devedor total (soma das parcelas ainda pendentes, já com os juros embutidos) e as próximas parcelas a vencer entre todas elas. conta é totalmente opcional — sem conta informada, agrega de todas as contas; nunca pergunte pela conta antes de chamar, chame direto. Se o usuário citar o nome/apelido da conta, use-o diretamente, mesmo que pareça um tipo de conta (ex: "PJ", "PF"). Consulta, sem efeito colateral — não exige confirmação.',
    schema: schemaResumoDividas,
    handler: async (args) => {
      const { conta_id: contaId, conta_apelido: contaApelido } = args as z.infer<typeof schemaResumoDividas>;

      let contaResolvidaId: number | undefined;
      let apelidoConta: string | undefined;
      if (contaId !== undefined || contaApelido !== undefined) {
        const resolucao = resolverContaId(db, contaId, contaApelido);
        if (!resolucao.ok) return resolucao.mensagem;
        contaResolvidaId = resolucao.id;
        apelidoConta = obterConta(db, resolucao.id)?.apelido;
      }

      const parcelasPendentes = listarParcelasPendentesDividasAtivas(db, contaResolvidaId);
      const dividasAtivas = listarDividasAtivas(db, contaResolvidaId);

      if (dividasAtivas.length === 0) {
        return apelidoConta
          ? `Nenhuma dívida ativa na conta "${apelidoConta}".`
          : 'Nenhuma dívida ativa encontrada.';
      }

      const saldoDevedorTotal = parcelasPendentes.reduce((soma, item) => soma + item.parcela.valor, 0);
      const proximas = parcelasPendentes.slice(0, MAX_PROXIMAS_PARCELAS);

      const linhasProximas = proximas.map((item) => {
        const parteDescricao = item.dividaDescricao ? ` "${item.dividaDescricao}"` : '';
        return `- ${item.dividaTipo}${parteDescricao} parcela ${item.parcela.numeroParcela}: R$ ${item.parcela.valor.toFixed(2)}, vence em ${item.parcela.dataVencimento}`;
      });

      const parteConta = apelidoConta ? ` na conta "${apelidoConta}"` : '';
      const blocoProximas =
        linhasProximas.length > 0
          ? `\nPróximas parcelas a vencer:\n${linhasProximas.join('\n')}`
          : '';

      return `Resumo de dívidas ativas${parteConta}: ${dividasAtivas.length} dívida(s), saldo devedor total R$ ${saldoDevedorTotal.toFixed(2)} (soma das parcelas pendentes).${blocoProximas}`;
    },
  };
}
