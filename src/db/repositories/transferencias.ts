import type { DbClient } from '../client.js';

export type NovaTransferencia = {
  contaOrigemId: number;
  contaDestinoId: number;
  valor: number;
  taxa?: number;
  descricao?: string;
  data: string;
};

export type Transferencia = {
  id: number;
  contaOrigemId: number;
  contaDestinoId: number;
  valor: number;
  taxa: number;
  descricao: string | null;
  data: string;
};

export function criarTransferencia(db: DbClient, transferencia: NovaTransferencia): Transferencia {
  const taxa = transferencia.taxa ?? 0;

  const resultado = db
    .prepare(
      `INSERT INTO transferencias (conta_origem_id, conta_destino_id, valor, taxa, descricao, data)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      transferencia.contaOrigemId,
      transferencia.contaDestinoId,
      transferencia.valor,
      taxa,
      transferencia.descricao ?? null,
      transferencia.data,
    );

  return {
    id: Number(resultado.lastInsertRowid),
    contaOrigemId: transferencia.contaOrigemId,
    contaDestinoId: transferencia.contaDestinoId,
    valor: transferencia.valor,
    taxa,
    descricao: transferencia.descricao ?? null,
    data: transferencia.data,
  };
}

export type FiltroTransferencias = {
  contaId?: number;
  dataInicio?: string;
  dataFim?: string;
};

export type TransferenciaListada = {
  valor: number;
  taxa: number;
  data: string;
  contaOrigemApelido: string;
  contaDestinoApelido: string;
};

export function listarTransferencias(
  db: DbClient,
  filtro: FiltroTransferencias = {},
): TransferenciaListada[] {
  const condicoes: string[] = [];
  const params: unknown[] = [];

  if (filtro.contaId !== undefined) {
    condicoes.push('(t.conta_origem_id = ? OR t.conta_destino_id = ?)');
    params.push(filtro.contaId, filtro.contaId);
  }
  if (filtro.dataInicio !== undefined) {
    condicoes.push('t.data >= ?');
    params.push(filtro.dataInicio);
  }
  if (filtro.dataFim !== undefined) {
    condicoes.push('t.data <= ?');
    params.push(filtro.dataFim);
  }

  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  const linhas = db
    .prepare(
      `SELECT t.valor, t.taxa, t.data, co.apelido AS origem_apelido, cd.apelido AS destino_apelido
       FROM transferencias t
       JOIN contas co ON co.id = t.conta_origem_id
       JOIN contas cd ON cd.id = t.conta_destino_id
       ${where}
       ORDER BY t.data, t.id`,
    )
    .all(...params) as {
    valor: number;
    taxa: number;
    data: string;
    origem_apelido: string;
    destino_apelido: string;
  }[];

  return linhas.map((linha) => ({
    valor: linha.valor,
    taxa: linha.taxa,
    data: linha.data,
    contaOrigemApelido: linha.origem_apelido,
    contaDestinoApelido: linha.destino_apelido,
  }));
}

export function calcularSaldoTransferenciasConta(db: DbClient, contaId: number): number {
  const linha = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN conta_destino_id = ? THEN valor - taxa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN conta_origem_id = ? THEN valor ELSE 0 END), 0) AS delta
       FROM transferencias WHERE conta_origem_id = ? OR conta_destino_id = ?`,
    )
    .get(contaId, contaId, contaId, contaId) as { delta: number };
  return linha.delta;
}
