import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import { criarTransacao } from '../../db/repositories/transacoes.js';
import { resolverCartaoId, resolverContaId } from './resolucao.js';
import type { ToolDefinition } from './types.js';

const schemaTransacaoLote = z.object({
  tipo: z.enum(['receita', 'despesa']),
  valor: z.number().positive(),
  categoria: z.string().min(1),
  descricao: z.string().optional(),
  data: z.string().min(1),
});

export type TransacaoLote = z.infer<typeof schemaTransacaoLote>;

const schemaRegistrarTransacoesEmLote = z
  .object({
    conta_id: z.number().int().positive().optional(),
    conta_apelido: z.string().min(1).optional(),
    cartao_id: z.number().int().positive().optional(),
    cartao_nome: z.string().min(1).optional(),
    transacoes: z.array(schemaTransacaoLote).min(1),
  })
  .refine(
    (valor) =>
      valor.conta_id !== undefined ||
      valor.conta_apelido !== undefined ||
      valor.cartao_id !== undefined ||
      valor.cartao_nome !== undefined,
    { message: 'Informe conta (id ou apelido) ou cartão (id ou nome) — todas as transações do lote vão pra mesma conta/cartão.' },
  );

type ArgsRegistrarTransacoesEmLote = z.infer<typeof schemaRegistrarTransacoesEmLote>;

type ResolucaoContaCartao =
  | { ok: true; contaId?: number; cartaoId?: number }
  | { ok: false; mensagem: string };

function resolverContaOuCartao(db: DbClient, args: ArgsRegistrarTransacoesEmLote): ResolucaoContaCartao {
  let contaId: number | undefined;
  if (args.conta_id !== undefined || args.conta_apelido !== undefined) {
    const resolucao = resolverContaId(db, args.conta_id, args.conta_apelido);
    if (!resolucao.ok) return { ok: false, mensagem: resolucao.mensagem };
    contaId = resolucao.id;
  }

  let cartaoId: number | undefined;
  if (args.cartao_id !== undefined || args.cartao_nome !== undefined) {
    const resolucao = resolverCartaoId(db, args.cartao_id, args.cartao_nome);
    if (!resolucao.ok) return { ok: false, mensagem: resolucao.mensagem };
    cartaoId = resolucao.id;
  }

  return { ok: true, contaId, cartaoId };
}

function resumoLote(transacoes: TransacaoLote[]): string {
  const total = transacoes.reduce((soma, t) => soma + (t.tipo === 'despesa' ? t.valor : -t.valor), 0);
  const totalDespesas = transacoes.filter((t) => t.tipo === 'despesa').reduce((soma, t) => soma + t.valor, 0);
  const totalReceitas = transacoes.filter((t) => t.tipo === 'receita').reduce((soma, t) => soma + t.valor, 0);
  return `${transacoes.length} transações — R$ ${totalDespesas.toFixed(2)} em despesas, R$ ${totalReceitas.toFixed(2)} em receitas (saldo líquido: R$ ${(-total).toFixed(2)})`;
}

// Diferente de registrar_transacao (só exige confirmação quando forçada
// externamente por exigirConfirmacaoDeRegistro), esta tool exige sempre —
// é sempre alto impacto por ser escrita em lote (ver tasks/plan.md, parte 13).
export function criarToolRegistrarTransacoesEmLote(db: DbClient): ToolDefinition {
  return {
    name: 'registrar_transacoes_em_lote',
    description:
      'Registra várias transações de uma vez, todas na mesma conta ou cartão (por id ou pelo nome/apelido) — usado quando várias transações já vêm identificadas de uma fonte externa (ex: planilha de extrato), nunca como atalho de digitação manual.',
    schema: schemaRegistrarTransacoesEmLote,
    requerConfirmacao: true,
    avisoConfirmacao: (args) => {
      const { transacoes } = args as ArgsRegistrarTransacoesEmLote;
      return resumoLote(transacoes);
    },
    handler: async (args, _ctx) => {
      const { transacoes } = args as ArgsRegistrarTransacoesEmLote;

      const resolucao = resolverContaOuCartao(db, args as ArgsRegistrarTransacoesEmLote);
      if (!resolucao.ok) return resolucao.mensagem;

      for (const transacao of transacoes) {
        criarTransacao(db, {
          contaId: resolucao.contaId,
          cartaoId: resolucao.cartaoId,
          tipo: transacao.tipo,
          valor: transacao.valor,
          categoria: transacao.categoria,
          descricao: transacao.descricao,
          data: transacao.data,
        });
      }

      return `Registradas ${resumoLote(transacoes)}.`;
    },
  };
}
