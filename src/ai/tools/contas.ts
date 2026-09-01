import { z } from 'zod';
import { buscarCartaoPorNomeNaConta, criarCartao } from '../../db/repositories/cartoes.js';
import { buscarContaPorApelido, criarConta } from '../../db/repositories/contas.js';
import type { DbClient } from '../../db/client.js';
import { resolverContaId } from './resolucao.js';
import type { ToolDefinition } from './types.js';

const schemaCriarConta = z.object({
  banco: z.string().min(1),
  tipo: z.enum(['PF', 'PJ']),
  apelido: z.string().min(1),
  saldo_inicial: z.number().optional(),
});

const schemaCriarCartao = z
  .object({
    conta_id: z.number().int().positive().optional(),
    conta_apelido: z.string().min(1).optional(),
    nome: z.string().min(1),
    limite: z.number().positive(),
    dia_fechamento: z.number().int().min(1).max(31),
    dia_vencimento: z.number().int().min(1).max(31),
  })
  .refine((valor) => valor.conta_id !== undefined || valor.conta_apelido !== undefined, {
    message: 'Informe conta_id ou conta_apelido.',
  });

export function criarToolCriarConta(db: DbClient): ToolDefinition {
  return {
    name: 'criar_conta',
    description:
      'Cria uma nova conta bancária (PF ou PJ), vinculada a um banco pelo nome (o banco é criado automaticamente se ainda não existir).',
    schema: schemaCriarConta,
    requerConfirmacao: true,
    handler: async (args) => {
      const { banco, tipo, apelido, saldo_inicial: saldoInicial } = args as z.infer<
        typeof schemaCriarConta
      >;

      const [existente] = buscarContaPorApelido(db, apelido);
      if (existente) {
        return `Já existe uma conta com o apelido "${apelido}". Apelidos de conta precisam ser únicos — escolha outro, ou use a conta já existente.`;
      }

      const conta = criarConta(db, { bancoNome: banco, tipo, apelido, saldoInicial });
      return `Conta criada: "${apelido}" (${tipo}), banco ${banco}, saldo inicial R$ ${conta.saldoAtual.toFixed(2)}.`;
    },
  };
}

export function criarToolCriarCartao(db: DbClient): ToolDefinition {
  return {
    name: 'criar_cartao',
    description:
      'Cria um cartão de crédito vinculado a uma conta já existente, informada pelo id ou pelo apelido da conta.',
    schema: schemaCriarCartao,
    requerConfirmacao: true,
    handler: async (args) => {
      const {
        conta_id: contaId,
        conta_apelido: contaApelido,
        nome,
        limite,
        dia_fechamento: diaFechamento,
        dia_vencimento: diaVencimento,
      } = args as z.infer<typeof schemaCriarCartao>;

      const resolucao = resolverContaId(db, contaId, contaApelido);
      if (!resolucao.ok) {
        return resolucao.mensagem;
      }

      const existente = buscarCartaoPorNomeNaConta(db, resolucao.id, nome);
      if (existente) {
        return `Essa conta já tem um cartão chamado "${nome}". Nome de cartão precisa ser único dentro da mesma conta — escolha outro, ou use o cartão já existente.`;
      }

      criarCartao(db, { contaId: resolucao.id, nome, limite, diaFechamento, diaVencimento });
      return `Cartão "${nome}" criado, limite R$ ${limite.toFixed(2)}, fechamento dia ${diaFechamento}, vencimento dia ${diaVencimento}.`;
    },
  };
}
