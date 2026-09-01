import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import {
  atualizarTransacao,
  criarTransacao,
  excluirTransacao,
} from '../../db/repositories/transacoes.js';
import type { ToolDefinition } from './types.js';

const schemaRegistrarTransacao = z
  .object({
    conta_id: z.number().int().positive().optional(),
    cartao_id: z.number().int().positive().optional(),
    tipo: z.enum(['receita', 'despesa']),
    valor: z.number().positive(),
    categoria: z.string().min(1),
    descricao: z.string().optional(),
    data: z.string().min(1),
  })
  .refine((valor) => valor.conta_id !== undefined || valor.cartao_id !== undefined, {
    message: 'Informe conta_id ou cartao_id.',
  });

const schemaEditarTransacao = z
  .object({
    id: z.number().int().positive(),
    tipo: z.enum(['receita', 'despesa']).optional(),
    valor: z.number().positive().optional(),
    categoria: z.string().min(1).optional(),
    descricao: z.string().optional(),
    data: z.string().min(1).optional(),
  })
  .refine(
    (valor) =>
      valor.tipo !== undefined ||
      valor.valor !== undefined ||
      valor.categoria !== undefined ||
      valor.descricao !== undefined ||
      valor.data !== undefined,
    { message: 'Informe pelo menos um campo para alterar.' },
  );

const schemaExcluirTransacao = z.object({
  id: z.number().int().positive(),
});

export function criarToolRegistrarTransacao(db: DbClient): ToolDefinition {
  return {
    name: 'registrar_transacao',
    description:
      'Registra uma nova transação de receita ou despesa, vinculada a uma conta ou a um cartão.',
    schema: schemaRegistrarTransacao,
    handler: async (args) => {
      const {
        conta_id: contaId,
        cartao_id: cartaoId,
        tipo,
        valor,
        categoria,
        descricao,
        data,
      } = args as z.infer<typeof schemaRegistrarTransacao>;

      const transacao = criarTransacao(db, { contaId, cartaoId, tipo, valor, categoria, descricao, data });
      return `${tipo === 'receita' ? 'Receita' : 'Despesa'} registrada: R$ ${valor.toFixed(2)}, categoria "${categoria}", data ${data}. ID da transação: ${transacao.id}.`;
    },
  };
}

export function criarToolEditarTransacao(db: DbClient): ToolDefinition {
  return {
    name: 'editar_transacao',
    description: 'Atualiza campos de uma transação já existente, identificada pelo id.',
    schema: schemaEditarTransacao,
    handler: async (args) => {
      const { id, ...mudancas } = args as z.infer<typeof schemaEditarTransacao>;

      const transacao = atualizarTransacao(db, id, mudancas);
      if (!transacao) {
        return `Não encontrei nenhuma transação com id ${id}. Confirme o id antes de tentar novamente.`;
      }

      const camposAlterados = Object.keys(mudancas).join(', ');
      return `Transação ${id} atualizada (${camposAlterados}). Estado atual: R$ ${transacao.valor.toFixed(2)}, categoria "${transacao.categoria}", data ${transacao.data}.`;
    },
  };
}

export function criarToolExcluirTransacao(db: DbClient): ToolDefinition {
  return {
    name: 'excluir_transacao',
    description: 'Exclui uma transação (exclusão lógica, nunca remove o registro do banco).',
    schema: schemaExcluirTransacao,
    requerConfirmacao: true,
    handler: async (args) => {
      const { id } = args as z.infer<typeof schemaExcluirTransacao>;

      const excluida = excluirTransacao(db, id);
      if (!excluida) {
        return `Não encontrei nenhuma transação ativa com id ${id}. Confirme o id antes de tentar novamente.`;
      }

      return `Transação ${id} excluída.`;
    },
  };
}
