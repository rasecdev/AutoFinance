import { z } from 'zod';
import { definirUltimaTransacao, obterUltimaTransacao } from '../../bot/contextoRecente.js';
import type { DbClient } from '../../db/client.js';
import {
  atualizarTransacao,
  criarTransacao,
  excluirTransacao,
  obterTransacao,
} from '../../db/repositories/transacoes.js';
import { resolverCartaoId, resolverContaId } from './resolucao.js';
import type { ToolDefinition } from './types.js';

const schemaRegistrarTransacao = z
  .object({
    conta_id: z.number().int().positive().optional(),
    conta_apelido: z.string().min(1).optional(),
    cartao_id: z.number().int().positive().optional(),
    cartao_nome: z.string().min(1).optional(),
    tipo: z.enum(['receita', 'despesa']),
    valor: z.number().positive(),
    categoria: z.string().min(1),
    descricao: z.string().optional(),
    data: z.string().min(1).optional(),
  })
  .refine(
    (valor) =>
      valor.conta_id !== undefined ||
      valor.conta_apelido !== undefined ||
      valor.cartao_id !== undefined ||
      valor.cartao_nome !== undefined,
    { message: 'Informe conta (id ou apelido) ou cartão (id ou nome).' },
  );

const schemaEditarTransacao = z
  .object({
    id: z.number().int().positive().optional(),
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
  id: z.number().int().positive().optional(),
});

function resolverIdTransacao(chatId: number, idInformado?: number): number | undefined {
  return idInformado ?? obterUltimaTransacao(chatId);
}

function hojeISO(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function criarToolRegistrarTransacao(db: DbClient): ToolDefinition {
  return {
    name: 'registrar_transacao',
    description:
      'Registra uma nova transação de receita ou despesa, vinculada a uma conta ou a um cartão (por id ou pelo nome/apelido). O campo "data" é opcional — só informe quando o usuário mencionar uma data específica; quando omitido, usa a data de hoje automaticamente.',
    schema: schemaRegistrarTransacao,
    handler: async (args, ctx) => {
      const {
        conta_id: contaIdInformado,
        conta_apelido: contaApelido,
        cartao_id: cartaoIdInformado,
        cartao_nome: cartaoNome,
        tipo,
        valor,
        categoria,
        descricao,
        data: dataInformada,
      } = args as z.infer<typeof schemaRegistrarTransacao>;

      const data = dataInformada ?? hojeISO();

      let contaId: number | undefined;
      if (contaIdInformado !== undefined || contaApelido !== undefined) {
        const resolucao = resolverContaId(db, contaIdInformado, contaApelido);
        if (!resolucao.ok) return resolucao.mensagem;
        contaId = resolucao.id;
      }

      let cartaoId: number | undefined;
      if (cartaoIdInformado !== undefined || cartaoNome !== undefined) {
        const resolucao = resolverCartaoId(db, cartaoIdInformado, cartaoNome);
        if (!resolucao.ok) return resolucao.mensagem;
        cartaoId = resolucao.id;
      }

      const transacao = criarTransacao(db, { contaId, cartaoId, tipo, valor, categoria, descricao, data });
      definirUltimaTransacao(ctx.chatId, transacao.id);

      return `${tipo === 'receita' ? 'Receita' : 'Despesa'} registrada: R$ ${valor.toFixed(2)}, categoria "${categoria}", data ${data}.`;
    },
  };
}

export function criarToolEditarTransacao(db: DbClient): ToolDefinition {
  return {
    name: 'editar_transacao',
    description:
      'Atualiza campos de uma transação existente. Aceita o id; quando omitido (ex: "edita a transação que acabei de registrar", "muda o valor dessa transação"), usa a última transação registrada nesta conversa — NUNCA pergunte pelo id ou peça "qual transação" antes de chamar, chame direto sem id.',
    schema: schemaEditarTransacao,
    handler: async (args, ctx) => {
      const { id: idInformado, ...mudancas } = args as z.infer<typeof schemaEditarTransacao>;

      const id = resolverIdTransacao(ctx.chatId, idInformado);
      if (id === undefined) {
        return 'Não sei qual transação você quer editar — informe o id ou registre uma transação primeiro nesta conversa.';
      }

      const transacao = atualizarTransacao(db, id, mudancas);
      if (!transacao) {
        return 'Não encontrei essa transação. Confirme antes de tentar novamente.';
      }

      const camposAlterados = Object.keys(mudancas).join(', ');
      return `Transação atualizada (${camposAlterados}). Estado atual: R$ ${transacao.valor.toFixed(2)}, categoria "${transacao.categoria}", data ${transacao.data}.`;
    },
  };
}

export function criarToolExcluirTransacao(db: DbClient): ToolDefinition {
  return {
    name: 'excluir_transacao',
    description:
      'Exclui uma transação (exclusão lógica, nunca remove o registro do banco). Aceita o id; quando omitido (ex: "exclui essa transação"), usa a última transação registrada nesta conversa — NUNCA pergunte pelo id antes de chamar, chame direto sem id.',
    schema: schemaExcluirTransacao,
    requerConfirmacao: true,
    handler: async (args, ctx) => {
      const { id: idInformado } = args as z.infer<typeof schemaExcluirTransacao>;

      const id = resolverIdTransacao(ctx.chatId, idInformado);
      if (id === undefined) {
        return 'Não sei qual transação você quer excluir — informe o id ou registre uma transação primeiro nesta conversa.';
      }

      const transacao = obterTransacao(db, id);
      const excluida = excluirTransacao(db, id);
      if (!excluida) {
        return 'Não encontrei nenhuma transação ativa com esse id. Confirme antes de tentar novamente.';
      }

      if (!transacao) {
        return 'Transação excluída.';
      }
      return `Transação excluída: R$ ${transacao.valor.toFixed(2)}, categoria "${transacao.categoria}", data ${transacao.data}.`;
    },
  };
}
