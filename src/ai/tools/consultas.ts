import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import { obterConta } from '../../db/repositories/contas.js';
import {
  calcularSaldoTransacoesConta,
  listarTransacoesAtivas,
} from '../../db/repositories/transacoes.js';
import { resolverContaId } from './resolucao.js';
import type { ToolDefinition } from './types.js';

const schemaConsultarSaldo = z
  .object({
    conta_id: z.number().int().positive().optional(),
    conta_apelido: z.string().min(1).optional(),
  })
  .refine((valor) => valor.conta_id !== undefined || valor.conta_apelido !== undefined, {
    message: 'Informe conta_id ou conta_apelido.',
  });

const schemaListarTransacoes = z.object({
  conta_id: z.number().int().positive().optional(),
  conta_apelido: z.string().min(1).optional(),
  categoria: z.string().min(1).optional(),
  data_inicio: z.string().min(1).optional(),
  data_fim: z.string().min(1).optional(),
});

const schemaResumoMensal = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/, 'Use o formato AAAA-MM.'),
  conta_id: z.number().int().positive().optional(),
  conta_apelido: z.string().min(1).optional(),
});

function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [anoStr, mesStr] = mes.split('-');
  const ano = Number(anoStr);
  const numeroMes = Number(mesStr);
  const ultimoDia = new Date(ano, numeroMes, 0).getDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimoDia).padStart(2, '0')}` };
}

export function criarToolConsultarSaldo(db: DbClient): ToolDefinition {
  return {
    name: 'consultar_saldo',
    description: 'Consulta o saldo atual de uma conta, informada pelo id ou pelo apelido.',
    schema: schemaConsultarSaldo,
    handler: async (args) => {
      const { conta_id: contaId, conta_apelido: contaApelido } = args as z.infer<
        typeof schemaConsultarSaldo
      >;

      const resolucao = resolverContaId(db, contaId, contaApelido);
      if (!resolucao.ok) return resolucao.mensagem;

      const conta = obterConta(db, resolucao.id);
      if (!conta) return 'Não encontrei essa conta.';

      const saldo = conta.saldoAtual + calcularSaldoTransacoesConta(db, resolucao.id);
      return `Saldo de "${conta.apelido}": R$ ${saldo.toFixed(2)}.`;
    },
  };
}

export function criarToolListarTransacoes(db: DbClient): ToolDefinition {
  return {
    name: 'listar_transacoes',
    description:
      'Lista transações ativas, com filtros opcionais por conta (id ou apelido), categoria e período (data_inicio/data_fim, formato AAAA-MM-DD).',
    schema: schemaListarTransacoes,
    handler: async (args) => {
      const {
        conta_id: contaId,
        conta_apelido: contaApelido,
        categoria,
        data_inicio: dataInicio,
        data_fim: dataFim,
      } = args as z.infer<typeof schemaListarTransacoes>;

      let contaResolvidaId: number | undefined;
      if (contaId !== undefined || contaApelido !== undefined) {
        const resolucao = resolverContaId(db, contaId, contaApelido);
        if (!resolucao.ok) return resolucao.mensagem;
        contaResolvidaId = resolucao.id;
      }

      const transacoes = listarTransacoesAtivas(db, {
        contaId: contaResolvidaId,
        categoria,
        dataInicio,
        dataFim,
      });

      if (transacoes.length === 0) {
        return 'Nenhuma transação encontrada com esses filtros.';
      }

      const linhas = transacoes.map(
        (t) =>
          `- ${t.tipo === 'receita' ? 'Receita' : 'Despesa'} R$ ${t.valor.toFixed(2)}, categoria "${t.categoria}", data ${t.data}`,
      );
      return `${transacoes.length} transação(ões) encontrada(s):\n${linhas.join('\n')}`;
    },
  };
}

export function criarToolResumoMensal(db: DbClient): ToolDefinition {
  return {
    name: 'resumo_mensal',
    description:
      'Resume receitas e despesas de um mês (formato AAAA-MM), agregando por categoria e tipo. Aceita filtrar por conta (id ou apelido).',
    schema: schemaResumoMensal,
    handler: async (args) => {
      const { mes, conta_id: contaId, conta_apelido: contaApelido } = args as z.infer<
        typeof schemaResumoMensal
      >;

      let contaResolvidaId: number | undefined;
      if (contaId !== undefined || contaApelido !== undefined) {
        const resolucao = resolverContaId(db, contaId, contaApelido);
        if (!resolucao.ok) return resolucao.mensagem;
        contaResolvidaId = resolucao.id;
      }

      const { inicio, fim } = limitesDoMes(mes);
      const transacoes = listarTransacoesAtivas(db, {
        contaId: contaResolvidaId,
        dataInicio: inicio,
        dataFim: fim,
      });

      if (transacoes.length === 0) {
        return `Nenhuma transação encontrada em ${mes}.`;
      }

      const totaisPorCategoria = new Map<string, { receita: number; despesa: number }>();
      let totalReceita = 0;
      let totalDespesa = 0;

      for (const t of transacoes) {
        const totais = totaisPorCategoria.get(t.categoria) ?? { receita: 0, despesa: 0 };
        if (t.tipo === 'receita') {
          totais.receita += t.valor;
          totalReceita += t.valor;
        } else {
          totais.despesa += t.valor;
          totalDespesa += t.valor;
        }
        totaisPorCategoria.set(t.categoria, totais);
      }

      const linhas = [...totaisPorCategoria.entries()].map(([categoria, totais]) => {
        const partes: string[] = [];
        if (totais.receita > 0) partes.push(`receita R$ ${totais.receita.toFixed(2)}`);
        if (totais.despesa > 0) partes.push(`despesa R$ ${totais.despesa.toFixed(2)}`);
        return `- "${categoria}": ${partes.join(', ')}`;
      });

      return `Resumo de ${mes}: receita total R$ ${totalReceita.toFixed(2)}, despesa total R$ ${totalDespesa.toFixed(2)}.\nPor categoria:\n${linhas.join('\n')}`;
    },
  };
}
