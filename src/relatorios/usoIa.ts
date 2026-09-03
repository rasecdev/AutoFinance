import type { DbClient } from '../db/client.js';
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

export type AgregacaoUsoIa = {
  porFluxoModelo: TotalPorFluxoModelo[];
  totalTokensPrompt: number;
  totalTokensCompletion: number;
  totalCustoEstimado: number;
  interacoesIncorretas: number;
  metrica1: CandidatoReferencia[];
};

// uso_tokens/interacoes_ia gravam data_hora como timestamp completo (ISO),
// diferente de transacoes.data (data pura) — PeriodoRelatorio sempre usa
// AAAA-MM-DD, então aqui a janela vira o dia inteiro em UTC antes de comparar.
function paraJanelaTimestamp(periodo: PeriodoRelatorio): { inicio: string; fim: string } {
  return {
    inicio: `${periodo.inicio}T00:00:00.000Z`,
    fim: `${periodo.fim}T23:59:59.999Z`,
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

  return {
    porFluxoModelo: [...porFluxoModeloMap.values()],
    totalTokensPrompt,
    totalTokensCompletion,
    totalCustoEstimado,
    interacoesIncorretas: contarInteracoesAvaliadasIncorretas(db, janela),
    metrica1: calcularMetrica1(db, totalTokensPrompt, totalTokensCompletion),
  };
}
