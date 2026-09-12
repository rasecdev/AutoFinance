import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import { obterConta } from '../../db/repositories/contas.js';
import { projetarFluxoCaixa } from '../../relatorios/fluxoCaixa.js';
import { resolverContaId } from './resolucao.js';
import type { ToolDefinition } from './types.js';

const schemaProjetarFluxoCaixa = z.object({
  dias: z.number().int().positive(),
  conta_id: z.number().int().positive().optional(),
  conta_apelido: z.string().min(1).optional(),
});

export function criarToolProjetarFluxoCaixa(db: DbClient): ToolDefinition {
  return {
    name: 'projetar_fluxo_caixa',
    description:
      'Projeta o saldo dos próximos "dias" a partir de hoje, somando o que já está agendado pra vencer (parcelas de dívida pendentes, faturas de cartão abertas, despesas fixas ativas sem cartão) contra o saldo atual — avisa a data em que o saldo ficaria negativo, se ficar. conta é totalmente opcional — sem conta informada, projeta somando todas as contas juntas; nunca pergunte pela conta antes de chamar, chame direto. Não sabe prever receita futura (o sistema não agenda entrada de dinheiro) — a projeção considera só saída conhecida. Consulta, sem efeito colateral — não exige confirmação.',
    schema: schemaProjetarFluxoCaixa,
    handler: async (args) => {
      const { dias, conta_id: contaId, conta_apelido: contaApelido } = args as z.infer<
        typeof schemaProjetarFluxoCaixa
      >;

      let contaResolvidaId: number | undefined;
      let apelidoConta: string | undefined;
      if (contaId !== undefined || contaApelido !== undefined) {
        const resolucao = resolverContaId(db, contaId, contaApelido);
        if (!resolucao.ok) return resolucao.mensagem;
        contaResolvidaId = resolucao.id;
        apelidoConta = obterConta(db, resolucao.id)?.apelido;
      }

      const resultado = projetarFluxoCaixa(db, dias, contaResolvidaId);
      const parteConta = apelidoConta ? ` na conta "${apelidoConta}"` : '';

      if (resultado.eventos.length === 0) {
        return `Projeção de fluxo de caixa${parteConta} pros próximos ${dias} dias: nenhum vencimento agendado — saldo continua R$ ${resultado.saldoAtual.toFixed(2)}.`;
      }

      const linhasEventos = resultado.eventos.map(
        (evento) => `- ${evento.data}: ${evento.descricao}, R$ ${evento.valor.toFixed(2)}`,
      );

      const avisoNegativo =
        resultado.dataFicaNegativo !== null
          ? `\n\n⚠️ O saldo projetado fica negativo a partir de ${resultado.dataFicaNegativo}.`
          : '';

      return `Projeção de fluxo de caixa${parteConta} pros próximos ${dias} dias:\nSaldo atual: R$ ${resultado.saldoAtual.toFixed(2)}\nSaldo projetado: R$ ${resultado.saldoProjetado.toFixed(2)}\n\nVencimentos no período:\n${linhasEventos.join('\n')}${avisoNegativo}`;
    },
  };
}
