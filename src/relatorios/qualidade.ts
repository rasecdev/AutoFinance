import type { DbClient } from '../db/client.js';
import { agruparErrosPorContexto, type ErroPorContexto } from '../db/repositories/errosExecucao.js';
import { agruparInteracoesPorFluxoModelo, type QualidadePorFluxoModelo } from '../db/repositories/interacoesIa.js';
import type { PeriodoRelatorio } from './financeiro.js';

export type AgregacaoQualidade = {
  porFluxoModelo: QualidadePorFluxoModelo[];
  erroPorContexto: ErroPorContexto[];
  totalInteracoes: number;
  totalIncorretas: number;
  totalErrosTecnicos: number;
};

// Mesmo achado real documentado em usoIa.ts/errosExecucao.ts: PeriodoRelatorio
// usa data pura (AAAA-MM-DD) no fuso local do processo, diferente do
// timestamp UTC completo gravado em data_hora — cada módulo de relatorios/
// mantém sua própria cópia dessa conversão (mesma convenção já estabelecida).
function paraData(dataISO: string, hora: number, minuto: number, segundo: number, ms: number): Date {
  const partes = dataISO.split('-').map(Number);
  const ano = partes[0] ?? 0;
  const mes = partes[1] ?? 1;
  const dia = partes[2] ?? 1;
  return new Date(ano, mes - 1, dia, hora, minuto, segundo, ms);
}

function paraJanelaTimestamp(periodo: PeriodoRelatorio): { inicio: string; fim: string } {
  return {
    inicio: paraData(periodo.inicio, 0, 0, 0, 0).toISOString(),
    fim: paraData(periodo.fim, 23, 59, 59, 999).toISOString(),
  };
}

export function agregarQualidadePeriodo(db: DbClient, periodo: PeriodoRelatorio): AgregacaoQualidade {
  const janela = paraJanelaTimestamp(periodo);

  const porFluxoModelo = agruparInteracoesPorFluxoModelo(db, janela);
  const erroPorContexto = agruparErrosPorContexto(db, periodo);

  let totalInteracoes = 0;
  let totalIncorretas = 0;
  for (const item of porFluxoModelo) {
    totalInteracoes += item.total;
    totalIncorretas += item.incorretas;
  }

  const totalErrosTecnicos = erroPorContexto.reduce((soma, item) => soma + item.total, 0);

  return { porFluxoModelo, erroPorContexto, totalInteracoes, totalIncorretas, totalErrosTecnicos };
}
