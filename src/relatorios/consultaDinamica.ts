import type { DbClient } from '../db/client.js';
import type { TipoTransacao } from '../db/repositories/transacoes.js';

export type DominioConsulta = 'financeiro';
export type MetricaConsulta = 'soma_valor' | 'media_valor' | 'contagem' | 'saldo';
export type DimensaoFinanceiro = 'categoria' | 'conta_id' | 'cartao_id' | 'dia_semana' | 'mes' | 'tipo_transacao';
export type Dimensao = DimensaoFinanceiro;

export type FiltrosConsultaDinamica = {
  dataInicio?: string;
  dataFim?: string;
  categoria?: string;
  contaId?: number;
  cartaoId?: number;
  tipo?: TipoTransacao;
};

export type ParamsConsultaDinamica = {
  dominio: DominioConsulta;
  metrica: MetricaConsulta;
  agruparPor: Dimensao[];
  filtros?: FiltrosConsultaDinamica;
  ordenarPor?: 'asc' | 'desc';
  limite?: number;
};

export type LinhaResultadoConsultaDinamica = {
  serie?: string;
  rotulo: string;
  valor: number;
};

export type ResultadoConsultaDinamica = {
  linhas: LinhaResultadoConsultaDinamica[];
};

const DIMENSOES_FINANCEIRO: readonly DimensaoFinanceiro[] = [
  'categoria',
  'conta_id',
  'cartao_id',
  'dia_semana',
  'mes',
  'tipo_transacao',
];

const DIMENSOES_TEMPO: readonly Dimensao[] = ['mes', 'dia_semana'];

const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const NOMES_DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export class ParametroConsultaInvalidoError extends Error {}

function validarDimensoes(agruparPor: Dimensao[]): void {
  if (agruparPor.length === 0 || agruparPor.length > 2) {
    throw new ParametroConsultaInvalidoError('agrupar_por precisa ter 1 ou 2 dimensões.');
  }
  for (const dimensao of agruparPor) {
    if (!DIMENSOES_FINANCEIRO.includes(dimensao)) {
      throw new ParametroConsultaInvalidoError(`Dimensão "${dimensao}" não é permitida no domínio "financeiro".`);
    }
  }
}

function colunaAgrupamento(dimensao: DimensaoFinanceiro): string {
  switch (dimensao) {
    case 'categoria':
      return 'categoria';
    case 'conta_id':
      return 'conta_id';
    case 'cartao_id':
      return 'cartao_id';
    case 'tipo_transacao':
      return 'tipo';
    case 'dia_semana':
      return "CAST(strftime('%w', data) AS INTEGER)";
    case 'mes':
      return "strftime('%Y-%m', data)";
  }
}

function expressaoMetrica(metrica: MetricaConsulta): string {
  switch (metrica) {
    case 'soma_valor':
      return 'SUM(valor)';
    case 'media_valor':
      return 'AVG(valor)';
    case 'contagem':
      return 'COUNT(*)';
    case 'saldo':
      return "SUM(CASE WHEN tipo = 'receita' THEN valor ELSE -valor END)";
  }
}

function rotuloDimensao(dimensao: Dimensao, valorBruto: unknown): string {
  if (dimensao === 'mes') {
    const [, mesStr] = String(valorBruto).split('-');
    const indice = Number(mesStr) - 1;
    const anoCurto = String(valorBruto).slice(2, 4);
    return `${NOMES_MES[indice] ?? valorBruto}/${anoCurto}`;
  }
  if (dimensao === 'dia_semana') {
    return NOMES_DIA_SEMANA[Number(valorBruto)] ?? String(valorBruto);
  }
  return valorBruto === null || valorBruto === undefined ? '(sem valor)' : String(valorBruto);
}

function chaveOrdemTempo(dimensao: Dimensao, valorBruto: unknown): number {
  if (dimensao === 'mes') {
    return Number(String(valorBruto).replace('-', ''));
  }
  return Number(valorBruto);
}

function montarFiltros(filtros: FiltrosConsultaDinamica): { condicoes: string[]; params: unknown[] } {
  const condicoes: string[] = ["status = 'ativa'"];
  const params: unknown[] = [];

  if (filtros.dataInicio !== undefined) {
    condicoes.push('data >= ?');
    params.push(filtros.dataInicio);
  }
  if (filtros.dataFim !== undefined) {
    condicoes.push('data <= ?');
    params.push(filtros.dataFim);
  }
  if (filtros.categoria !== undefined) {
    condicoes.push('LOWER(categoria) = LOWER(?)');
    params.push(filtros.categoria);
  }
  if (filtros.contaId !== undefined) {
    condicoes.push('conta_id = ?');
    params.push(filtros.contaId);
  }
  if (filtros.cartaoId !== undefined) {
    condicoes.push('cartao_id = ?');
    params.push(filtros.cartaoId);
  }
  if (filtros.tipo !== undefined) {
    condicoes.push('tipo = ?');
    params.push(filtros.tipo);
  }

  return { condicoes, params };
}

type LinhaBruta = Record<string, unknown> & { metrica_valor: number };
type LinhaResultadoComChave = LinhaResultadoConsultaDinamica & { chaveOrdem: number };

function executarQuery(db: DbClient, params: ParamsConsultaDinamica): LinhaBruta[] {
  const { metrica, agruparPor, filtros = {} } = params;

  const colunasAgrupamento = agruparPor.map(colunaAgrupamento);
  const selectDimensoes = colunasAgrupamento.map((coluna, indice) => `${coluna} AS dim_${indice}`).join(', ');
  const { condicoes, params: paramsFiltro } = montarFiltros(filtros);

  const sql = `SELECT ${selectDimensoes}, ${expressaoMetrica(metrica)} AS metrica_valor
    FROM transacoes
    WHERE ${condicoes.join(' AND ')}
    GROUP BY ${colunasAgrupamento.join(', ')}`;

  return db.prepare(sql).all(...paramsFiltro) as LinhaBruta[];
}

function aplicarOrdenacaoELimite(
  linhas: LinhaResultadoComChave[],
  agruparPor: Dimensao[],
  ordenarPor: 'asc' | 'desc' | undefined,
  limite: number | undefined,
): LinhaResultadoComChave[] {
  const ultimaDimensao = agruparPor[agruparPor.length - 1] as Dimensao;
  const ehDimensaoTempo = DIMENSOES_TEMPO.includes(ultimaDimensao);

  const ordenadas = [...linhas].sort((a, b) => {
    if (ehDimensaoTempo) {
      return ordenarPor === 'desc' ? b.chaveOrdem - a.chaveOrdem : a.chaveOrdem - b.chaveOrdem;
    }
    return ordenarPor === 'asc' ? a.valor - b.valor : b.valor - a.valor;
  });

  return limite !== undefined ? ordenadas.slice(0, limite) : ordenadas;
}

export function executarConsultaDinamica(db: DbClient, params: ParamsConsultaDinamica): ResultadoConsultaDinamica {
  validarDimensoes(params.agruparPor);

  const linhasBrutas = executarQuery(db, params);

  const linhas: LinhaResultadoComChave[] = linhasBrutas.map((linha) => {
    if (params.agruparPor.length === 1) {
      const dimensao = params.agruparPor[0] as Dimensao;
      const valorBruto = linha.dim_0;
      return {
        rotulo: rotuloDimensao(dimensao, valorBruto),
        valor: linha.metrica_valor,
        chaveOrdem: chaveOrdemTempo(dimensao, valorBruto),
      };
    }

    const dimensaoSerie = params.agruparPor[0] as Dimensao;
    const dimensaoRotulo = params.agruparPor[1] as Dimensao;
    return {
      serie: rotuloDimensao(dimensaoSerie, linha.dim_0),
      rotulo: rotuloDimensao(dimensaoRotulo, linha.dim_1),
      valor: linha.metrica_valor,
      chaveOrdem: chaveOrdemTempo(dimensaoRotulo, linha.dim_1),
    };
  });

  const ordenadas = aplicarOrdenacaoELimite(linhas, params.agruparPor, params.ordenarPor, params.limite);

  return {
    linhas: ordenadas.map(({ chaveOrdem: _chaveOrdem, ...resto }) => resto),
  };
}
