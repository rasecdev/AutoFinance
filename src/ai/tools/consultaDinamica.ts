import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import {
  ParametroConsultaInvalidoError,
  executarConsultaDinamica,
  type Dimensao,
  type DominioConsulta,
  type MetricaConsulta,
} from '../../relatorios/consultaDinamica.js';
import { resolverContaId } from './resolucao.js';
import type { ToolDefinition } from './types.js';

const TODAS_DIMENSOES = [
  'categoria',
  'conta_id',
  'cartao_id',
  'dia_semana',
  'mes',
  'tipo_transacao',
  'fluxo',
  'modelo',
] as const;

const schemaFiltros = z.object({
  data_inicio: z.string().min(1).optional(),
  data_fim: z.string().min(1).optional(),
  categoria: z.string().min(1).optional(),
  conta_id: z.number().int().positive().optional(),
  conta_apelido: z.string().min(1).optional(),
  cartao_id: z.number().int().positive().optional(),
  tipo: z.enum(['receita', 'despesa']).optional(),
});

const schemaConsultarDadosDinamico = z.object({
  dominio: z.enum(['financeiro', 'uso_ia']),
  metrica: z.enum(['soma_valor', 'media_valor', 'contagem', 'saldo']),
  agrupar_por: z.array(z.enum(TODAS_DIMENSOES)).min(1).max(2),
  filtros: schemaFiltros.optional(),
  ordenar_por: z.enum(['asc', 'desc']).optional(),
  limite: z.number().int().positive().optional(),
});

function formatarValor(metrica: MetricaConsulta, valor: number): string {
  return metrica === 'contagem' ? String(valor) : valor.toFixed(2);
}

function montarEcoDeInterpretacao(args: z.infer<typeof schemaConsultarDadosDinamico>): string {
  const partes = [`domínio "${args.dominio}"`, `métrica "${args.metrica}"`, `agrupado por ${args.agrupar_por.join(' e ')}`];
  if (args.filtros?.data_inicio || args.filtros?.data_fim) {
    partes.push(`período ${args.filtros.data_inicio ?? '...'} a ${args.filtros.data_fim ?? '...'}`);
  }
  if (args.filtros?.categoria) partes.push(`categoria "${args.filtros.categoria}"`);
  if (args.filtros?.tipo) partes.push(`tipo "${args.filtros.tipo}"`);
  if (args.ordenar_por) partes.push(`ordenado ${args.ordenar_por === 'asc' ? 'crescente' : 'decrescente'}`);
  if (args.limite) partes.push(`limite ${args.limite}`);
  return `Interpretação: ${partes.join(', ')}.`;
}

export function criarToolConsultarDadosDinamico(db: DbClient): ToolDefinition {
  return {
    name: 'consultar_dados_dinamico',
    description:
      'Responde pergunta livre sobre o histórico que nenhuma outra ferramenta cobre (ex: "gastei mais aos sábados?", "top 5 categorias do mês", "quanto gastei com IA esse mês por fluxo"). Nunca gera SQL — só escolhe métrica/dimensão de uma lista fechada: metrica (soma_valor, media_valor, contagem, saldo — saldo só existe no domínio financeiro), agrupar_por (1 ou 2 dimensões; financeiro: categoria, conta_id, cartao_id, dia_semana, mes, tipo_transacao; uso_ia: fluxo, modelo), dominio (financeiro ou uso_ia — nunca misture os dois numa chamada, faça uma chamada por domínio se a pergunta cruzar os dois). mes/dia_semana sempre ordenam cronologicamente, ordenar_por só escolhe a direção nesses casos; nas outras dimensões ordenar_por/limite ordenam por valor (cobre "top N"). Se a pergunta pedir algo fora dessa lista, recuse explicando em vez de inventar um cálculo. Consulta, sem efeito colateral — não exige confirmação.',
    schema: schemaConsultarDadosDinamico,
    handler: async (args) => {
      const {
        dominio,
        metrica,
        agrupar_por: agruparPor,
        filtros: filtrosBrutos,
        ordenar_por: ordenarPor,
        limite,
      } = args as z.infer<typeof schemaConsultarDadosDinamico>;

      let contaId = filtrosBrutos?.conta_id;
      if (filtrosBrutos?.conta_apelido !== undefined) {
        const resolucao = resolverContaId(db, filtrosBrutos.conta_id, filtrosBrutos.conta_apelido);
        if (!resolucao.ok) return resolucao.mensagem;
        contaId = resolucao.id;
      }

      try {
        const resultado = executarConsultaDinamica(db, {
          dominio: dominio as DominioConsulta,
          metrica: metrica as MetricaConsulta,
          agruparPor: agruparPor as Dimensao[],
          filtros: {
            dataInicio: filtrosBrutos?.data_inicio,
            dataFim: filtrosBrutos?.data_fim,
            categoria: filtrosBrutos?.categoria,
            contaId,
            cartaoId: filtrosBrutos?.cartao_id,
            tipo: filtrosBrutos?.tipo,
          },
          ordenarPor,
          limite,
        });

        const eco = montarEcoDeInterpretacao(args as z.infer<typeof schemaConsultarDadosDinamico>);

        if (resultado.linhas.length === 0) {
          return `${eco}\nNenhum dado encontrado pra esses parâmetros.`;
        }

        const temSerie = resultado.linhas.some((linha) => linha.serie !== undefined);
        const linhasTexto = temSerie
          ? resultado.linhas.map((linha) => `- ${linha.serie} / ${linha.rotulo}: ${formatarValor(metrica as MetricaConsulta, linha.valor)}`)
          : resultado.linhas.map((linha) => `- ${linha.rotulo}: ${formatarValor(metrica as MetricaConsulta, linha.valor)}`);

        return `${eco}\n${linhasTexto.join('\n')}`;
      } catch (erro) {
        if (erro instanceof ParametroConsultaInvalidoError) {
          return `Não consegui calcular isso: ${erro.message}`;
        }
        throw erro;
      }
    },
  };
}
