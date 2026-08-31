import { z } from 'zod';
import { criarCartao } from '../../db/repositories/cartoes.js';
import { contaExiste, criarConta } from '../../db/repositories/contas.js';
import type { DbClient } from '../../db/client.js';
import type { ToolDefinition } from './types.js';

const schemaCriarConta = z.object({
  banco: z.string().min(1),
  tipo: z.enum(['PF', 'PJ']),
  apelido: z.string().min(1),
  saldo_inicial: z.number().optional(),
});

const schemaCriarCartao = z.object({
  conta_id: z.number().int().positive(),
  nome: z.string().min(1),
  limite: z.number().positive(),
  dia_fechamento: z.number().int().min(1).max(31),
  dia_vencimento: z.number().int().min(1).max(31),
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
      const conta = criarConta(db, { bancoNome: banco, tipo, apelido, saldoInicial });
      return `Conta criada: "${apelido}" (${tipo}), banco ${banco}, saldo inicial R$ ${conta.saldoAtual.toFixed(2)}. ID da conta: ${conta.id}.`;
    },
  };
}

export function criarToolCriarCartao(db: DbClient): ToolDefinition {
  return {
    name: 'criar_cartao',
    description: 'Cria um cartão de crédito vinculado a uma conta já existente (informada pelo id).',
    schema: schemaCriarCartao,
    requerConfirmacao: true,
    handler: async (args) => {
      const {
        conta_id: contaId,
        nome,
        limite,
        dia_fechamento: diaFechamento,
        dia_vencimento: diaVencimento,
      } = args as z.infer<typeof schemaCriarCartao>;

      if (!contaExiste(db, contaId)) {
        return `Não encontrei nenhuma conta com id ${contaId}. Confirme o id da conta antes de tentar novamente.`;
      }

      const cartao = criarCartao(db, { contaId, nome, limite, diaFechamento, diaVencimento });
      return `Cartão "${nome}" criado, limite R$ ${limite.toFixed(2)}, fechamento dia ${diaFechamento}, vencimento dia ${diaVencimento}. ID do cartão: ${cartao.id}.`;
    },
  };
}
