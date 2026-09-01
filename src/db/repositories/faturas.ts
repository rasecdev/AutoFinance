import type { DbClient } from '../client.js';

export type StatusFatura = 'aberta' | 'paga' | 'renegociada';

export type Fatura = {
  id: number;
  cartaoId: number;
  contaId: number;
  mesReferencia: string;
  valor: number;
  status: StatusFatura;
  dataPagamento: string | null;
};

type LinhaFatura = {
  id: number;
  cartao_id: number;
  conta_id: number;
  mes_referencia: string;
  valor: number;
  status: StatusFatura;
  data_pagamento: string | null;
};

function paraFatura(linha: LinhaFatura): Fatura {
  return {
    id: linha.id,
    cartaoId: linha.cartao_id,
    contaId: linha.conta_id,
    mesReferencia: linha.mes_referencia,
    valor: linha.valor,
    status: linha.status,
    dataPagamento: linha.data_pagamento,
  };
}

export function obterFatura(db: DbClient, id: number): Fatura | undefined {
  const linha = db
    .prepare(
      `SELECT f.id, f.cartao_id, c.conta_id, f.mes_referencia, f.valor, f.status, f.data_pagamento
       FROM faturas f
       JOIN cartoes c ON c.id = f.cartao_id
       WHERE f.id = ?`,
    )
    .get(id) as LinhaFatura | undefined;
  return linha ? paraFatura(linha) : undefined;
}

export function marcarFaturaRenegociada(db: DbClient, id: number): void {
  db.prepare("UPDATE faturas SET status = 'renegociada' WHERE id = ?").run(id);
}

export function marcarFaturaPaga(db: DbClient, id: number, dataPagamento: string): void {
  db.prepare("UPDATE faturas SET status = 'paga', data_pagamento = ? WHERE id = ?").run(dataPagamento, id);
}

export function buscarFaturaPorCartaoEMes(db: DbClient, cartaoId: number, mesReferencia: string): Fatura | undefined {
  const linha = db
    .prepare(
      `SELECT f.id, f.cartao_id, c.conta_id, f.mes_referencia, f.valor, f.status, f.data_pagamento
       FROM faturas f
       JOIN cartoes c ON c.id = f.cartao_id
       WHERE f.cartao_id = ? AND f.mes_referencia = ?`,
    )
    .get(cartaoId, mesReferencia) as LinhaFatura | undefined;
  return linha ? paraFatura(linha) : undefined;
}
