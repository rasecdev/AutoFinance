import type { DbClient } from '../client.js';

export type StatusParcela = 'pendente' | 'paga' | 'cancelada';

export type NovaParcela = {
  dividaId: number;
  numeroParcela: number;
  valor: number;
  dataVencimento: string;
};

export type Parcela = {
  id: number;
  dividaId: number;
  numeroParcela: number;
  valor: number;
  dataVencimento: string;
  status: StatusParcela;
  dataPagamento: string | null;
};

const COLUNAS_PARCELA = 'id, divida_id, numero_parcela, valor, data_vencimento, status, data_pagamento';

type LinhaParcela = {
  id: number;
  divida_id: number;
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
  status: StatusParcela;
  data_pagamento: string | null;
};

function paraParcela(linha: LinhaParcela): Parcela {
  return {
    id: linha.id,
    dividaId: linha.divida_id,
    numeroParcela: linha.numero_parcela,
    valor: linha.valor,
    dataVencimento: linha.data_vencimento,
    status: linha.status,
    dataPagamento: linha.data_pagamento,
  };
}

export function criarParcela(db: DbClient, parcela: NovaParcela): Parcela {
  const resultado = db
    .prepare('INSERT INTO parcelas (divida_id, numero_parcela, valor, data_vencimento) VALUES (?, ?, ?, ?)')
    .run(parcela.dividaId, parcela.numeroParcela, parcela.valor, parcela.dataVencimento);

  return {
    id: Number(resultado.lastInsertRowid),
    dividaId: parcela.dividaId,
    numeroParcela: parcela.numeroParcela,
    valor: parcela.valor,
    dataVencimento: parcela.dataVencimento,
    status: 'pendente',
    dataPagamento: null,
  };
}

export function listarParcelas(db: DbClient, dividaId: number): Parcela[] {
  const linhas = db
    .prepare(`SELECT ${COLUNAS_PARCELA} FROM parcelas WHERE divida_id = ? ORDER BY numero_parcela`)
    .all(dividaId) as LinhaParcela[];

  return linhas.map(paraParcela);
}

export function obterParcelaPorNumero(db: DbClient, dividaId: number, numeroParcela: number): Parcela | undefined {
  const linha = db
    .prepare(`SELECT ${COLUNAS_PARCELA} FROM parcelas WHERE divida_id = ? AND numero_parcela = ?`)
    .get(dividaId, numeroParcela) as LinhaParcela | undefined;
  return linha ? paraParcela(linha) : undefined;
}

// Sem número de parcela informado, "pagar_parcela" paga a mais antiga ainda
// pendente — cobre o caso de rotina (pagar a parcela do mês) sem exigir que o
// usuário saiba o número exato.
export function obterProximaParcelaPendente(db: DbClient, dividaId: number): Parcela | undefined {
  const linha = db
    .prepare(
      `SELECT ${COLUNAS_PARCELA} FROM parcelas WHERE divida_id = ? AND status = 'pendente' ORDER BY numero_parcela LIMIT 1`,
    )
    .get(dividaId) as LinhaParcela | undefined;
  return linha ? paraParcela(linha) : undefined;
}

export function marcarParcelaPaga(db: DbClient, id: number, dataPagamento: string): void {
  db.prepare("UPDATE parcelas SET status = 'paga', data_pagamento = ? WHERE id = ?").run(dataPagamento, id);
}
