import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import {
  ParametroConsultaInvalidoError,
  executarConsultaDinamica,
  type Dimensao,
  type DominioConsulta,
  type LinhaResultadoConsultaDinamica,
  type MetricaConsulta,
} from '../../relatorios/consultaDinamica.js';
import { limitesDoMes, mesAtualISO } from './consultas.js';
import { resolverContaId } from './resolucao.js';
import type { ToolDefinition } from './types.js';

export const TODAS_DIMENSOES = [
  'categoria',
  'conta_id',
  'cartao_id',
  'dia_semana',
  'mes',
  'tipo_transacao',
  'fluxo',
  'modelo',
] as const;

export const schemaFiltrosConsulta = z.object({
  data_inicio: z.string().min(1).optional(),
  data_fim: z.string().min(1).optional(),
  categoria: z.string().min(1).optional(),
  conta_id: z.number().int().positive().optional(),
  conta_apelido: z.string().min(1).optional(),
  cartao_id: z.number().int().positive().optional(),
  tipo: z.enum(['receita', 'despesa']).optional(),
});

export const schemaConsultaBase = z.object({
  dominio: z.enum(['financeiro', 'uso_ia']),
  metrica: z.enum(['soma_valor', 'media_valor', 'contagem', 'saldo']),
  agrupar_por: z.array(z.enum(TODAS_DIMENSOES)).min(1).max(2),
  filtros: schemaFiltrosConsulta.optional(),
  ordenar_por: z.enum(['asc', 'desc']).optional(),
  limite: z.number().int().positive().optional(),
});

type ArgsConsultaBase = z.infer<typeof schemaConsultaBase>;

function formatarValor(metrica: MetricaConsulta, valor: number): string {
  return metrica === 'contagem' ? String(valor) : valor.toFixed(2);
}

type PeriodoEfetivo =
  | { tipo: 'informado'; inicio?: string; fim?: string }
  | { tipo: 'mes_atual_padrao'; inicio: string; fim: string }
  | { tipo: 'sem_filtro' };

// Sem data_inicio/data_fim informados, o sistema aplica um padrão — nunca
// silenciosamente "todo o histórico" sem avisar (mitigação de Misinformation,
// PLANO.md item 8.4; achado real de teste manual: sem esse eco, o modelo
// respondia "esse mês" sobre um agregado que na verdade era all-time). Mesmo
// princípio de "o sistema aplica o padrão correto sozinho (mês atual)" já
// usado em consultar_extrato/resumo_mensal (regra 2 do SYSTEM_PROMPT) —
// exceto quando a própria dimensão de agrupamento já é "mes": nesse caso
// omitir o período é a forma correta de pedir uma tendência multi-mês (ver
// PLANO.md item 8.2, exemplo "gasto por categoria, mês a mês"), então não se
// aplica default nenhum.
function resolverPeriodoEfetivo(filtros: ArgsConsultaBase['filtros'], agruparPor: string[]): PeriodoEfetivo {
  if (filtros?.data_inicio !== undefined || filtros?.data_fim !== undefined) {
    return { tipo: 'informado', inicio: filtros?.data_inicio, fim: filtros?.data_fim };
  }
  if (agruparPor.includes('mes')) {
    return { tipo: 'sem_filtro' };
  }
  const { inicio, fim } = limitesDoMes(mesAtualISO());
  return { tipo: 'mes_atual_padrao', inicio, fim };
}

function descreverPeriodo(periodo: PeriodoEfetivo): string {
  switch (periodo.tipo) {
    case 'informado':
      return `período ${periodo.inicio ?? '...'} a ${periodo.fim ?? '...'}`;
    case 'mes_atual_padrao':
      return `período ${periodo.inicio} a ${periodo.fim} (mês atual, nenhum período foi informado)`;
    case 'sem_filtro':
      return 'sem filtro de período (todo o histórico)';
  }
}

function montarEcoDeInterpretacao(args: ArgsConsultaBase, periodo: PeriodoEfetivo): string {
  const partes = [
    `domínio "${args.dominio}"`,
    `métrica "${args.metrica}"`,
    `agrupado por ${args.agrupar_por.join(' e ')}`,
    descreverPeriodo(periodo),
  ];
  if (args.filtros?.categoria) partes.push(`categoria "${args.filtros.categoria}"`);
  if (args.filtros?.tipo) partes.push(`tipo "${args.filtros.tipo}"`);
  if (args.ordenar_por) partes.push(`ordenado ${args.ordenar_por === 'asc' ? 'crescente' : 'decrescente'}`);
  if (args.limite) partes.push(`limite ${args.limite}`);
  return `Interpretação: ${partes.join(', ')}.`;
}

function formatarLinhas(metrica: MetricaConsulta, linhas: LinhaResultadoConsultaDinamica[]): string {
  if (linhas.length === 0) return 'Nenhum dado encontrado pra esses parâmetros.';

  const temSerie = linhas.some((linha) => linha.serie !== undefined);
  const linhasTexto = temSerie
    ? linhas.map((linha) => `- ${linha.serie} / ${linha.rotulo}: ${formatarValor(metrica, linha.valor)}`)
    : linhas.map((linha) => `- ${linha.rotulo}: ${formatarValor(metrica, linha.valor)}`);

  return linhasTexto.join('\n');
}

export type ResultadoConsultaBase =
  | { ok: true; eco: string; textoResultado: string; linhas: LinhaResultadoConsultaDinamica[] }
  | { ok: false; mensagem: string };

// Compartilhado entre consultar_dados_dinamico e consultar_e_graficar — resolve
// conta (id ou apelido), executa a consulta e formata eco + texto do resultado.
// Nunca deixa de ecoar a interpretação, mesmo quando não há dado (mitigação de
// Misinformation, PLANO.md item 8.4).
export function resolverEExecutarConsulta(db: DbClient, args: ArgsConsultaBase): ResultadoConsultaBase {
  const { dominio, metrica, agrupar_por: agruparPor, filtros: filtrosBrutos, ordenar_por: ordenarPor, limite } = args;

  let contaId = filtrosBrutos?.conta_id;
  if (filtrosBrutos?.conta_apelido !== undefined) {
    const resolucao = resolverContaId(db, filtrosBrutos.conta_id, filtrosBrutos.conta_apelido);
    if (!resolucao.ok) return { ok: false, mensagem: resolucao.mensagem };
    contaId = resolucao.id;
  }

  const periodo = resolverPeriodoEfetivo(filtrosBrutos, agruparPor);
  const dataInicio = periodo.tipo === 'sem_filtro' ? undefined : periodo.inicio;
  const dataFim = periodo.tipo === 'sem_filtro' ? undefined : periodo.fim;

  try {
    const resultado = executarConsultaDinamica(db, {
      dominio: dominio as DominioConsulta,
      metrica: metrica as MetricaConsulta,
      agruparPor: agruparPor as Dimensao[],
      filtros: {
        dataInicio,
        dataFim,
        categoria: filtrosBrutos?.categoria,
        contaId,
        cartaoId: filtrosBrutos?.cartao_id,
        tipo: filtrosBrutos?.tipo,
      },
      ordenarPor,
      limite,
    });

    return {
      ok: true,
      eco: montarEcoDeInterpretacao(args, periodo),
      textoResultado: formatarLinhas(metrica as MetricaConsulta, resultado.linhas),
      linhas: resultado.linhas,
    };
  } catch (erro) {
    if (erro instanceof ParametroConsultaInvalidoError) {
      return { ok: false, mensagem: `Não consegui calcular isso: ${erro.message}` };
    }
    throw erro;
  }
}

export function criarToolConsultarDadosDinamico(db: DbClient): ToolDefinition {
  return {
    name: 'consultar_dados_dinamico',
    description:
      'Responde pergunta livre sobre o histórico que nenhuma outra ferramenta cobre (ex: "gastei mais aos sábados?", "top 5 categorias do mês", "quanto gastei com IA esse mês por fluxo"). Nunca gera SQL — só escolhe métrica/dimensão de uma lista fechada: metrica (soma_valor, media_valor, contagem, saldo — saldo só existe no domínio financeiro), agrupar_por (1 ou 2 dimensões; financeiro: categoria, conta_id, cartao_id, dia_semana, mes, tipo_transacao; uso_ia: fluxo, modelo), dominio (financeiro ou uso_ia — nunca misture os dois numa chamada, faça uma chamada por domínio se a pergunta cruzar os dois). NUNCA calcule data_inicio/data_fim você mesmo (regra 2 do system prompt) — omita filtros.data_inicio/data_fim quando o usuário disser "esse mês"/"hoje"/não citar período: sem agrupar_por incluir "mes", o sistema usa o mês atual sozinho (e o eco da resposta sempre diz qual período foi de fato usado); com agrupar_por incluindo "mes", omitir o período significa "todo o histórico" (pra tendência multi-mês, ex: gasto por categoria mês a mês). mes/dia_semana sempre ordenam cronologicamente, ordenar_por só escolhe a direção nesses casos; nas outras dimensões ordenar_por/limite ordenam por valor (cobre "top N"). Se a pergunta pedir algo fora dessa lista, recuse explicando em vez de inventar um cálculo. Consulta, sem efeito colateral — não exige confirmação.',
    schema: schemaConsultaBase,
    handler: async (args) => {
      const resultado = resolverEExecutarConsulta(db, args as ArgsConsultaBase);
      if (!resultado.ok) return resultado.mensagem;
      return `${resultado.eco}\n${resultado.textoResultado}`;
    },
  };
}
