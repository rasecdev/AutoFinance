import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import { encontrarFaturaCorrespondente } from '../../db/repositories/correspondenciaFaturaParcela.js';
import { atualizarValorFatura, criarFatura } from '../../db/repositories/faturas.js';
import type { ToolDefinition } from './types.js';

const schemaRegistrarFaturaEmail = z.object({
  cartao_id: z.number().int().positive(),
  mes_referencia: z.string().min(1),
  valor: z.number().positive(),
  status: z.enum(['aberta', 'paga', 'renegociada']).optional(),
});

type ArgsRegistrarFaturaEmail = z.infer<typeof schemaRegistrarFaturaEmail>;

// Sempre requerConfirmacao: true — assim como registrar_transacoes_em_lote,
// esta tool grava a partir de conteúdo externo não confiável (anexo de
// e-mail), então nunca escreve sem confirmação explícita do usuário (item 6
// do OWASP, mesmo princípio da leitura de comprovante da Fase 6 parte 12).
export function criarToolRegistrarFaturaEmail(db: DbClient): ToolDefinition {
  return {
    name: 'registrar_fatura_email',
    description:
      'Registra ou atualiza uma fatura de cartão a partir de dado extraído de e-mail (cartão, mês e valor já resolvidos) — atualiza a fatura existente se já houver uma pro mesmo cartão+mês, cria uma nova se não houver.',
    schema: schemaRegistrarFaturaEmail,
    requerConfirmacao: true,
    avisoConfirmacao: (args) => {
      const { cartao_id, mes_referencia, valor } = args as ArgsRegistrarFaturaEmail;
      const existente = encontrarFaturaCorrespondente(db, { cartaoId: cartao_id, mesReferencia: mes_referencia });
      return existente
        ? `Vai ATUALIZAR a fatura de ${mes_referencia} já cadastrada (valor atual R$ ${existente.valor.toFixed(2)} → novo valor R$ ${valor.toFixed(2)}).`
        : `Não achei fatura cadastrada pra ${mes_referencia} nesse cartão — vai CRIAR uma nova de R$ ${valor.toFixed(2)}.`;
    },
    handler: async (args, _ctx) => {
      const { cartao_id, mes_referencia, valor, status } = args as ArgsRegistrarFaturaEmail;

      const existente = encontrarFaturaCorrespondente(db, { cartaoId: cartao_id, mesReferencia: mes_referencia });

      if (existente) {
        atualizarValorFatura(db, existente.id, valor);
        return `Fatura de ${mes_referencia} atualizada pra R$ ${valor.toFixed(2)}.`;
      }

      criarFatura(db, { cartaoId: cartao_id, mesReferencia: mes_referencia, valor, status });
      return `Fatura de ${mes_referencia} criada: R$ ${valor.toFixed(2)}.`;
    },
  };
}
