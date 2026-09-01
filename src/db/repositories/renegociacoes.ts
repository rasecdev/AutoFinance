import type { DbClient } from '../client.js';

export type OrigemRenegociacao = 'divida' | 'fatura';

export type NovaRenegociacao = {
  origemTipo: OrigemRenegociacao;
  origemId: number;
  novaDividaId: number;
  motivo?: string;
  data: string;
};

export type Renegociacao = {
  id: number;
  origemTipo: OrigemRenegociacao;
  origemId: number;
  novaDividaId: number;
  motivo: string | null;
  data: string;
};

export function criarRenegociacao(db: DbClient, renegociacao: NovaRenegociacao): Renegociacao {
  const resultado = db
    .prepare(
      `INSERT INTO renegociacoes (divida_origem_tipo, divida_origem_id, nova_divida_id, motivo, data)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      renegociacao.origemTipo,
      renegociacao.origemId,
      renegociacao.novaDividaId,
      renegociacao.motivo ?? null,
      renegociacao.data,
    );

  return {
    id: Number(resultado.lastInsertRowid),
    origemTipo: renegociacao.origemTipo,
    origemId: renegociacao.origemId,
    novaDividaId: renegociacao.novaDividaId,
    motivo: renegociacao.motivo ?? null,
    data: renegociacao.data,
  };
}
