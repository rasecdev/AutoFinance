import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import { obterConta } from '../../db/repositories/contas.js';
import {
  atualizarDespesaFixa,
  criarDespesaFixa,
} from '../../db/repositories/despesasFixas.js';
import { resolverCartaoId, resolverContaId, resolverDespesaFixaId } from './resolucao.js';
import type { ToolDefinition } from './types.js';

const schemaCriarDespesaFixa = z
  .object({
    conta_id: z.number().int().positive().optional(),
    conta_apelido: z.string().min(1).optional(),
    cartao_id: z.number().int().positive().optional(),
    cartao_nome: z.string().min(1).optional(),
    descricao: z.string().min(1),
    categoria: z.string().min(1),
    valor_esperado: z.number().positive(),
    dia_vencimento_esperado: z.number().int().min(1).max(31),
  })
  .refine((valor) => valor.conta_id !== undefined || valor.conta_apelido !== undefined, {
    message: 'Informe a conta (id ou apelido).',
  });

const schemaEditarDespesaFixa = z
  .object({
    conta_id: z.number().int().positive().optional(),
    conta_apelido: z.string().min(1).optional(),
    descricao: z.string().min(1),
    valor_esperado: z.number().positive().optional(),
    dia_vencimento_esperado: z.number().int().min(1).max(31).optional(),
    status: z.enum(['ativa', 'pausada']).optional(),
  })
  .refine((valor) => valor.conta_id !== undefined || valor.conta_apelido !== undefined, {
    message: 'Informe a conta (id ou apelido).',
  })
  .refine(
    (valor) =>
      valor.valor_esperado !== undefined ||
      valor.dia_vencimento_esperado !== undefined ||
      valor.status !== undefined,
    { message: 'Informe pelo menos um campo para alterar.' },
  );

function hojeISO(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function criarToolCriarDespesaFixa(db: DbClient): ToolDefinition {
  return {
    name: 'criar_despesa_fixa',
    description:
      'Cadastra uma despesa fixa recorrente (aluguel, mensalidade, assinatura) vinculada a uma conta e, opcionalmente, a um cartão. Assim que o usuário informar descrição, categoria, valor esperado, dia de vencimento esperado e a conta, chame esta ferramenta diretamente — conta/cartão são resolvidos pelo nome/apelido. Baixo impacto, executa direto sem confirmação.',
    schema: schemaCriarDespesaFixa,
    handler: async (args) => {
      const {
        conta_id: contaIdInformado,
        conta_apelido: contaApelido,
        cartao_id: cartaoIdInformado,
        cartao_nome: cartaoNome,
        descricao,
        categoria,
        valor_esperado: valorEsperado,
        dia_vencimento_esperado: diaVencimentoEsperado,
      } = args as z.infer<typeof schemaCriarDespesaFixa>;

      const resolucaoConta = resolverContaId(db, contaIdInformado, contaApelido);
      if (!resolucaoConta.ok) return resolucaoConta.mensagem;

      let cartaoId: number | undefined;
      if (cartaoIdInformado !== undefined || cartaoNome !== undefined) {
        const resolucaoCartao = resolverCartaoId(db, cartaoIdInformado, cartaoNome);
        if (!resolucaoCartao.ok) return resolucaoCartao.mensagem;
        cartaoId = resolucaoCartao.id;
      }

      const despesa = criarDespesaFixa(db, {
        contaId: resolucaoConta.id,
        cartaoId,
        descricao,
        categoria,
        valorEsperado,
        diaVencimentoEsperado,
        criadoEm: hojeISO(),
      });

      const conta = obterConta(db, resolucaoConta.id);
      return `Despesa fixa "${despesa.descricao}" cadastrada: categoria "${despesa.categoria}", R$ ${despesa.valorEsperado.toFixed(2)}, todo dia ${despesa.diaVencimentoEsperado}, conta "${conta?.apelido ?? 'desconhecida'}".`;
    },
  };
}

export function criarToolEditarDespesaFixa(db: DbClient): ToolDefinition {
  return {
    name: 'editar_despesa_fixa',
    description:
      'Atualiza valor esperado, dia de vencimento esperado, ou pausa/reativa (status ativa/pausada) uma despesa fixa já cadastrada. Identificada por conta + descrição — nunca por id. NUNCA pergunte pelo id, chame direto com a conta e a descrição que o usuário mencionou.',
    schema: schemaEditarDespesaFixa,
    handler: async (args) => {
      const {
        conta_id: contaIdInformado,
        conta_apelido: contaApelido,
        descricao,
        valor_esperado: valorEsperado,
        dia_vencimento_esperado: diaVencimentoEsperado,
        status,
      } = args as z.infer<typeof schemaEditarDespesaFixa>;

      const resolucaoConta = resolverContaId(db, contaIdInformado, contaApelido);
      if (!resolucaoConta.ok) return resolucaoConta.mensagem;

      const resolucaoDespesa = resolverDespesaFixaId(db, resolucaoConta.id, descricao);
      if (!resolucaoDespesa.ok) return resolucaoDespesa.mensagem;

      const mudancas: Parameters<typeof atualizarDespesaFixa>[2] = {};
      if (valorEsperado !== undefined) mudancas.valorEsperado = valorEsperado;
      if (diaVencimentoEsperado !== undefined) mudancas.diaVencimentoEsperado = diaVencimentoEsperado;
      if (status !== undefined) mudancas.status = status;

      const despesa = atualizarDespesaFixa(db, resolucaoDespesa.id, mudancas);
      if (!despesa) {
        return 'Não encontrei essa despesa fixa. Confirme antes de tentar novamente.';
      }

      return `Despesa fixa "${despesa.descricao}" atualizada: R$ ${despesa.valorEsperado.toFixed(2)}, todo dia ${despesa.diaVencimentoEsperado}, status "${despesa.status}".`;
    },
  };
}
