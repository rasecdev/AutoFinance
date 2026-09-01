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
};

type LinhaParcela = {
  id: number;
  divida_id: number;
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
  status: StatusParcela;
};

function paraParcela(linha: LinhaParcela): Parcela {
  return {
    id: linha.id,
    dividaId: linha.divida_id,
    numeroParcela: linha.numero_parcela,
    valor: linha.valor,
    dataVencimento: linha.data_vencimento,
    status: linha.status,
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
  };
}

export function listarParcelas(db: DbClient, dividaId: number): Parcela[] {
  const linhas = db
    .prepare(
      'SELECT id, divida_id, numero_parcela, valor, data_vencimento, status FROM parcelas WHERE divida_id = ? ORDER BY numero_parcela',
    )
    .all(dividaId) as LinhaParcela[];

  return linhas.map(paraParcela);
}
