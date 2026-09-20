import type { TransacaoPluggy } from '../../integracoes/pluggy/cliente.js';
import type { DbClient } from '../client.js';

export type ParametrosCorrespondencia = { contaId: number; valor: number; data: string };

export type ResultadoCorrespondencia = 'encontrada' | 'nao_encontrada' | 'ambigua';

// Mesma tolerância de valor/data já usada na correspondência de parcela por
// aproximação (Fase 7, correspondenciaFaturaParcela.ts) — ±1% de valor,
// janela de ±5 dias. Reaproveitado aqui pelo mesmo motivo: sincronização
// bancária não bate no centavo/dia exato por atraso de compensação.
const TOLERANCIA_VALOR_PERCENTUAL = 0.01;
const JANELA_DATA_DIAS = 5;

function dentroDaJanela(dataCandidata: string, dataAlvo: string): boolean {
  const diffMs = Math.abs(new Date(dataCandidata).getTime() - new Date(dataAlvo).getTime());
  return diffMs <= JANELA_DATA_DIAS * 24 * 60 * 60 * 1000;
}

function classificar(candidatas: Array<{ data: string }>, dataAlvo: string): ResultadoCorrespondencia {
  const dentroDaData = candidatas.filter((c) => dentroDaJanela(c.data, dataAlvo));
  if (dentroDaData.length === 0) return 'nao_encontrada';
  if (dentroDaData.length > 1) return 'ambigua';
  return 'encontrada';
}

// Checagem 1 (ver tasks/plan.md, Fase 8) — bate contra transacoes já
// lançadas manualmente pelo usuário antes de criar uma nova, pra não
// duplicar o que já foi registrado por conversa com o bot. Só considera
// origem='manual' (nunca compara contra transação já vinda do próprio
// Open Finance, que teria seu próprio pluggy_transaction_id de controle).
export function encontrarTransacaoManualCorrespondente(
  db: DbClient,
  params: ParametrosCorrespondencia,
): ResultadoCorrespondencia {
  const candidatas = db
    .prepare(
      `SELECT data FROM transacoes
       WHERE conta_id = ? AND status = 'ativa' AND origem = 'manual'
         AND valor BETWEEN ? AND ?`,
    )
    .all(
      params.contaId,
      params.valor * (1 - TOLERANCIA_VALOR_PERCENTUAL),
      params.valor * (1 + TOLERANCIA_VALOR_PERCENTUAL),
    ) as Array<{ data: string }>;

  return classificar(candidatas, params.data);
}

// Checagem 2 — bate contra faturas/parcelas JÁ PAGAS (por conta_id do
// cartão/dívida). Pagamento de fatura/parcela sincronizado nunca vira
// transacao de despesa nova: o gasto já foi contado individualmente nas
// compras do cartão (ou já reduziu a dívida) no momento em que foi
// registrado — contar de novo no débito da conta duplicaria o gasto.
export function encontrarPagamentoFaturaOuParcelaCorrespondente(
  db: DbClient,
  params: ParametrosCorrespondencia,
): ResultadoCorrespondencia {
  const faturas = db
    .prepare(
      `SELECT f.data_pagamento AS data FROM faturas f
       JOIN cartoes c ON c.id = f.cartao_id
       WHERE c.conta_id = ? AND f.status = 'paga' AND f.data_pagamento IS NOT NULL
         AND f.valor BETWEEN ? AND ?`,
    )
    .all(
      params.contaId,
      params.valor * (1 - TOLERANCIA_VALOR_PERCENTUAL),
      params.valor * (1 + TOLERANCIA_VALOR_PERCENTUAL),
    ) as Array<{ data: string }>;

  const parcelas = db
    .prepare(
      `SELECT p.data_pagamento AS data FROM parcelas p
       JOIN dividas d ON d.id = p.divida_id
       WHERE d.conta_id = ? AND p.status = 'paga' AND p.data_pagamento IS NOT NULL
         AND p.valor BETWEEN ? AND ?`,
    )
    .all(
      params.contaId,
      params.valor * (1 - TOLERANCIA_VALOR_PERCENTUAL),
      params.valor * (1 + TOLERANCIA_VALOR_PERCENTUAL),
    ) as Array<{ data: string }>;

  return classificar([...faturas, ...parcelas], params.data);
}

// Heurística de saque — achado real de pesquisa (2026-09-20, docs.pluggy.ai):
// o campo "category" exige plano Pro da Pluggy e não documenta valores
// fixos (não dá pra confiar nele sozinho); "operationType" (ex: "SAQUE") só
// existe em conectores Open Finance, mas é o sinal mais confiável quando
// presente. Fallback por texto na descrição cobre o caso de não vir
// operationType (conector legado ou sandbox).
const PADRAO_SAQUE_TEXTO = /saque|withdrawal|\batm\b|caixa eletr[oô]nico/i;

export function pareceSaque(transacao: TransacaoPluggy): boolean {
  if (transacao.operationType?.toUpperCase() === 'SAQUE') {
    return true;
  }

  return PADRAO_SAQUE_TEXTO.test(transacao.description) || (transacao.category !== undefined && PADRAO_SAQUE_TEXTO.test(transacao.category));
}
