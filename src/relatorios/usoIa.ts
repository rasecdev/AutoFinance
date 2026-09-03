import type { DbClient } from '../db/client.js';
import { listarBenchmarks } from '../db/repositories/benchmarksModelos.js';
import { contarInteracoesAvaliadasIncorretas } from '../db/repositories/interacoesIa.js';
import { obterUltimosSnapshots } from '../db/repositories/modelosOpenrouterHistorico.js';
import { listarModelosReferenciaAtivos } from '../db/repositories/modelosReferenciaComparacao.js';
import { listarUsoTokensPeriodo } from '../db/repositories/usoTokens.js';
import type { PeriodoRelatorio } from './financeiro.js';

export type TotalPorFluxoModelo = {
  fluxo: string;
  modelo: string;
  tokensPrompt: number;
  tokensCompletion: number;
  custoEstimado: number;
};

export type CandidatoReferencia = {
  nomeExibicao: string;
  modelo: string;
  custoEstimado: number;
};

export type MetricaModeloEmUso = {
  fluxo: string;
  modelo: string;
  custoEstimado: number;
  metrica: string;
  valor: number;
  fonteUrl: string;
};

export type AgregacaoUsoIa = {
  porFluxoModelo: TotalPorFluxoModelo[];
  totalTokensPrompt: number;
  totalTokensCompletion: number;
  totalCustoEstimado: number;
  interacoesIncorretas: number;
  metrica1: CandidatoReferencia[];
  metrica3: MetricaModeloEmUso[];
};

// uso_tokens/interacoes_ia gravam data_hora como timestamp UTC completo
// (new Date().toISOString()), diferente de transacoes.data (data pura) —
// PeriodoRelatorio sempre usa AAAA-MM-DD no fuso local do processo (mesmo
// fuso usado por calcularJanelaPeriodo). Achado real: só concatenar "T00:00:00.000Z"
// na data local e tratar como se já fosse UTC quebra silenciosamente em
// qualquer fuso ≠ UTC — meia-noite local não é meia-noite UTC. Construir os
// limites via componentes locais (new Date(ano, mes, dia, ...)) e converter
// com toISOString() dá o instante UTC correto, seja qual for o fuso do
// processo (dev local ou container em produção, mesmo sem TZ configurado).
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

function calcularMetrica1(
  db: DbClient,
  totalTokensPrompt: number,
  totalTokensCompletion: number,
): CandidatoReferencia[] {
  const candidatos: CandidatoReferencia[] = [];

  for (const referencia of listarModelosReferenciaAtivos(db)) {
    const [snapshotMaisRecente] = obterUltimosSnapshots(db, referencia.modelIdOpenrouter, 1);
    if (!snapshotMaisRecente) continue;

    const custoEstimado =
      totalTokensPrompt * snapshotMaisRecente.precoPrompt +
      totalTokensCompletion * snapshotMaisRecente.precoCompletion;

    candidatos.push({
      nomeExibicao: referencia.nomeExibicao,
      modelo: referencia.modelIdOpenrouter,
      custoEstimado,
    });
  }

  return candidatos;
}

// listarBenchmarks já ordena por id DESC — a primeira ocorrência de cada
// nome de métrica é a mais recente (curadoria pode registrar a mesma métrica
// de novo depois, ex: revisão trimestral).
function calcularMetrica3(
  db: DbClient,
  porFluxoModelo: TotalPorFluxoModelo[],
): MetricaModeloEmUso[] {
  const resultado: MetricaModeloEmUso[] = [];

  for (const item of porFluxoModelo) {
    const metricasVistas = new Set<string>();

    for (const benchmark of listarBenchmarks(db, item.fluxo, item.modelo)) {
      if (metricasVistas.has(benchmark.metrica)) continue;
      metricasVistas.add(benchmark.metrica);

      resultado.push({
        fluxo: item.fluxo,
        modelo: item.modelo,
        custoEstimado: item.custoEstimado,
        metrica: benchmark.metrica,
        valor: benchmark.valor,
        fonteUrl: benchmark.fonteUrl,
      });
    }
  }

  return resultado;
}

export function agregarUsoIaPeriodo(db: DbClient, periodo: PeriodoRelatorio): AgregacaoUsoIa {
  const janela = paraJanelaTimestamp(periodo);
  const registros = listarUsoTokensPeriodo(db, janela).filter((registro) => registro.origem === 'uso_real');

  const porFluxoModeloMap = new Map<string, TotalPorFluxoModelo>();
  let totalTokensPrompt = 0;
  let totalTokensCompletion = 0;
  let totalCustoEstimado = 0;

  for (const registro of registros) {
    const chave = `${registro.fluxo}::${registro.modelo}`;
    const atual = porFluxoModeloMap.get(chave) ?? {
      fluxo: registro.fluxo,
      modelo: registro.modelo,
      tokensPrompt: 0,
      tokensCompletion: 0,
      custoEstimado: 0,
    };

    atual.tokensPrompt += registro.tokensPrompt;
    atual.tokensCompletion += registro.tokensCompletion;
    atual.custoEstimado += registro.custoEstimado;
    porFluxoModeloMap.set(chave, atual);

    totalTokensPrompt += registro.tokensPrompt;
    totalTokensCompletion += registro.tokensCompletion;
    totalCustoEstimado += registro.custoEstimado;
  }

  const porFluxoModelo = [...porFluxoModeloMap.values()];

  return {
    porFluxoModelo,
    totalTokensPrompt,
    totalTokensCompletion,
    totalCustoEstimado,
    interacoesIncorretas: contarInteracoesAvaliadasIncorretas(db, janela),
    metrica1: calcularMetrica1(db, totalTokensPrompt, totalTokensCompletion),
    metrica3: calcularMetrica3(db, porFluxoModelo),
  };
}
