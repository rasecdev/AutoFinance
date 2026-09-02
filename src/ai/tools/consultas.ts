import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import { obterConta } from '../../db/repositories/contas.js';
import {
  calcularSaldoTransacoesConta,
  listarTransacoesAtivas,
} from '../../db/repositories/transacoes.js';
import {
  calcularSaldoTransferenciasConta,
  listarTransferencias,
} from '../../db/repositories/transferencias.js';
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
  mes: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Use o formato AAAA-MM.')
    .optional(),
  conta_id: z.number().int().positive().optional(),
  conta_apelido: z.string().min(1).optional(),
});

function mesAtualISO(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

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
    description:
      'Consulta o saldo atual de uma conta. Assim que o usuário citar o nome/apelido da conta, chame esta ferramenta diretamente com esse nome em conta_apelido — mesmo que o apelido pareça um tipo de conta (ex: "PJ", "PF"), é só um nome como outro qualquer; não peça confirmação extra, a ferramenta resolve ou avisa sozinha se não encontrar.',
    schema: schemaConsultarSaldo,
    handler: async (args) => {
      const { conta_id: contaId, conta_apelido: contaApelido } = args as z.infer<
        typeof schemaConsultarSaldo
      >;

      const resolucao = resolverContaId(db, contaId, contaApelido);
      if (!resolucao.ok) return resolucao.mensagem;

      const conta = obterConta(db, resolucao.id);
      if (!conta) return 'Não encontrei essa conta.';

      const saldo =
        conta.saldoAtual +
        calcularSaldoTransacoesConta(db, resolucao.id) +
        calcularSaldoTransferenciasConta(db, resolucao.id);
      return `Saldo de "${conta.apelido}": R$ ${saldo.toFixed(2)}.`;
    },
  };
}

export function criarToolListarTransacoes(db: DbClient): ToolDefinition {
  return {
    name: 'listar_transacoes',
    description:
      'Lista transações (receita/despesa do dia a dia) ativas e transferências entre contas, com filtros opcionais por conta (id ou apelido), categoria e período (data_inicio/data_fim, formato AAAA-MM-DD). Sem período informado, usa o mês atual. Transferência não tem categoria — ao filtrar por categoria, só transações aparecem. NUNCA use esta ferramenta pra dívida, financiamento, empréstimo ou consignado — isso é consultar_dividas_ativas/resumo_dividas, um domínio totalmente diferente. Assim que o usuário citar o nome/apelido da conta, chame esta ferramenta diretamente com esse nome em conta_apelido — mesmo que pareça um tipo de conta (ex: "PJ", "PF"), é só um nome; não peça confirmação extra.',
    schema: schemaListarTransacoes,
    handler: async (args) => {
      const {
        conta_id: contaId,
        conta_apelido: contaApelido,
        categoria,
        data_inicio: dataInicioInformada,
        data_fim: dataFimInformada,
      } = args as z.infer<typeof schemaListarTransacoes>;

      let dataInicio = dataInicioInformada;
      let dataFim = dataFimInformada;
      if (dataInicio === undefined && dataFim === undefined) {
        const limites = limitesDoMes(mesAtualISO());
        dataInicio = limites.inicio;
        dataFim = limites.fim;
      }

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

      const transferencias =
        categoria === undefined
          ? listarTransferencias(db, { contaId: contaResolvidaId, dataInicio, dataFim })
          : [];

      if (transacoes.length === 0 && transferencias.length === 0) {
        return 'Nenhuma transação encontrada com esses filtros.';
      }

      const linhasTransacoes = transacoes.map((t) => ({
        data: t.data,
        texto: `- ${t.tipo === 'receita' ? 'Receita' : 'Despesa'} R$ ${t.valor.toFixed(2)}, categoria "${t.categoria}", data ${t.data}`,
      }));

      const linhasTransferencias = transferencias.map((tr) => {
        const recebido = tr.valor - tr.taxa;
        const parteTaxa = tr.taxa > 0 ? `, R$ ${recebido.toFixed(2)} recebidos (taxa R$ ${tr.taxa.toFixed(2)})` : '';
        return {
          data: tr.data,
          texto: `- Transferência de "${tr.contaOrigemApelido}" para "${tr.contaDestinoApelido}": R$ ${tr.valor.toFixed(2)} enviados${parteTaxa}, data ${tr.data}`,
        };
      });

      const linhas = [...linhasTransacoes, ...linhasTransferencias].sort((a, b) =>
        a.data.localeCompare(b.data),
      );
      const total = transacoes.length + transferencias.length;

      return `${total} registro(s) encontrado(s):\n${linhas.map((l) => l.texto).join('\n')}`;
    },
  };
}

export function criarToolResumoMensal(db: DbClient): ToolDefinition {
  return {
    name: 'resumo_mensal',
    description:
      'Resume receitas, despesas e transferências de um mês (formato AAAA-MM) — o extrato consolidado da conta no período: receita/despesa agregadas por categoria, mais o total enviado e recebido via transferência. Sem mês informado, usa o mês atual. Aceita filtrar por conta (id ou apelido) — assim que o usuário citar o nome/apelido da conta, chame diretamente com esse nome em conta_apelido, mesmo que pareça um tipo de conta (ex: "PJ", "PF"); não peça confirmação extra.',
    schema: schemaResumoMensal,
    handler: async (args) => {
      const {
        mes: mesInformado,
        conta_id: contaId,
        conta_apelido: contaApelido,
      } = args as z.infer<typeof schemaResumoMensal>;

      const mes = mesInformado ?? mesAtualISO();

      let contaResolvidaId: number | undefined;
      let apelidoDaContaFiltrada: string | undefined;
      if (contaId !== undefined || contaApelido !== undefined) {
        const resolucao = resolverContaId(db, contaId, contaApelido);
        if (!resolucao.ok) return resolucao.mensagem;
        contaResolvidaId = resolucao.id;
        apelidoDaContaFiltrada = obterConta(db, resolucao.id)?.apelido;
      }

      const { inicio, fim } = limitesDoMes(mes);
      const transacoes = listarTransacoesAtivas(db, {
        contaId: contaResolvidaId,
        dataInicio: inicio,
        dataFim: fim,
      });
      const transferencias = listarTransferencias(db, {
        contaId: contaResolvidaId,
        dataInicio: inicio,
        dataFim: fim,
      });

      if (transacoes.length === 0 && transferencias.length === 0) {
        return `Nenhuma movimentação encontrada em ${mes}.`;
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

      const linhasCategoria = [...totaisPorCategoria.entries()].map(([categoria, totais]) => {
        const partes: string[] = [];
        if (totais.receita > 0) partes.push(`receita R$ ${totais.receita.toFixed(2)}`);
        if (totais.despesa > 0) partes.push(`despesa R$ ${totais.despesa.toFixed(2)}`);
        return `- "${categoria}": ${partes.join(', ')}`;
      });

      let blocoCategorias = '';
      if (linhasCategoria.length > 0) {
        blocoCategorias = `\nPor categoria:\n${linhasCategoria.join('\n')}`;
      }

      let blocoTransferencias = '';
      if (transferencias.length > 0) {
        let totalEnviado = 0;
        let totalRecebido = 0;
        const linhasTransferencias = transferencias.map((tr) => {
          if (apelidoDaContaFiltrada === undefined || tr.contaOrigemApelido === apelidoDaContaFiltrada) {
            totalEnviado += tr.valor;
          }
          if (apelidoDaContaFiltrada === undefined || tr.contaDestinoApelido === apelidoDaContaFiltrada) {
            totalRecebido += tr.valor - tr.taxa;
          }
          const parteTaxa = tr.taxa > 0 ? `, R$ ${(tr.valor - tr.taxa).toFixed(2)} líquidos (taxa R$ ${tr.taxa.toFixed(2)})` : '';
          return `- "${tr.contaOrigemApelido}" para "${tr.contaDestinoApelido}": R$ ${tr.valor.toFixed(2)}${parteTaxa}`;
        });
        blocoTransferencias = `\nTransferências:\n${linhasTransferencias.join('\n')}\nTotal: R$ ${totalEnviado.toFixed(2)} enviados, R$ ${totalRecebido.toFixed(2)} recebidos.`;
      }

      return `Resumo de ${mes}: receita total R$ ${totalReceita.toFixed(2)}, despesa total R$ ${totalDespesa.toFixed(2)}.${blocoCategorias}${blocoTransferencias}`;
    },
  };
}
