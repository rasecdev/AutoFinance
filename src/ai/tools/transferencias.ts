import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import { criarTransferencia } from '../../db/repositories/transferencias.js';
import { resolverContaId } from './resolucao.js';
import type { ToolDefinition } from './types.js';

const schemaRegistrarTransferencia = z
  .object({
    conta_origem_id: z.number().int().positive().optional(),
    conta_origem_apelido: z.string().min(1).optional(),
    conta_destino_id: z.number().int().positive().optional(),
    conta_destino_apelido: z.string().min(1).optional(),
    valor: z.number().positive(),
    taxa: z.number().min(0).optional(),
    descricao: z.string().optional(),
    data: z.string().min(1).optional(),
  })
  .refine(
    (valor) => valor.conta_origem_id !== undefined || valor.conta_origem_apelido !== undefined,
    { message: 'Informe a conta de origem (id ou apelido).' },
  )
  .refine(
    (valor) => valor.conta_destino_id !== undefined || valor.conta_destino_apelido !== undefined,
    { message: 'Informe a conta de destino (id ou apelido).' },
  );

function hojeISO(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function criarToolRegistrarTransferencia(db: DbClient): ToolDefinition {
  return {
    name: 'registrar_transferencia',
    description:
      'Registra uma transferência entre duas contas. Assim que o usuário citar o nome/apelido da conta de origem e o da conta de destino (mesmo os dois na mesma frase), chame esta ferramenta diretamente com esses nomes em conta_origem_apelido/conta_destino_apelido — não peça confirmação extra de que as contas existem, a ferramenta resolve ou avisa sozinha se não encontrar. Não é receita nem despesa — nunca grava em transações. Com taxa informada, a conta de destino recebe valor menos taxa; sem taxa, o valor é integral (1:1).',
    schema: schemaRegistrarTransferencia,
    handler: async (args) => {
      const {
        conta_origem_id: contaOrigemIdInformado,
        conta_origem_apelido: contaOrigemApelido,
        conta_destino_id: contaDestinoIdInformado,
        conta_destino_apelido: contaDestinoApelido,
        valor,
        taxa,
        descricao,
        data: dataInformada,
      } = args as z.infer<typeof schemaRegistrarTransferencia>;

      const resolucaoOrigem = resolverContaId(db, contaOrigemIdInformado, contaOrigemApelido);
      if (!resolucaoOrigem.ok) return resolucaoOrigem.mensagem;

      const resolucaoDestino = resolverContaId(db, contaDestinoIdInformado, contaDestinoApelido);
      if (!resolucaoDestino.ok) return resolucaoDestino.mensagem;

      if (resolucaoOrigem.id === resolucaoDestino.id) {
        return 'A conta de origem e a de destino não podem ser a mesma.';
      }

      const data = dataInformada ?? hojeISO();

      const transferencia = criarTransferencia(db, {
        contaOrigemId: resolucaoOrigem.id,
        contaDestinoId: resolucaoDestino.id,
        valor,
        taxa,
        descricao,
        data,
      });

      const recebido = transferencia.valor - transferencia.taxa;
      const parteTaxa = transferencia.taxa > 0 ? `, taxa R$ ${transferencia.taxa.toFixed(2)}` : '';
      return `Transferência registrada: R$ ${transferencia.valor.toFixed(2)} enviados, R$ ${recebido.toFixed(2)} recebidos${parteTaxa}, data ${data}.`;
    },
  };
}
