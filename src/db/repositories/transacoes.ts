import type { DbClient } from '../client.js';

export type TipoTransacao = 'receita' | 'despesa';
export type StatusTransacao = 'ativa' | 'excluida';

export type NovaTransacao = {
  contaId?: number;
  cartaoId?: number;
  tipo: TipoTransacao;
  valor: number;
  categoria: string;
  descricao?: string;
  data: string;
};

export type Transacao = {
  id: number;
  contaId: number | null;
  cartaoId: number | null;
  tipo: TipoTransacao;
  valor: number;
  categoria: string;
  descricao: string | null;
  data: string;
  status: StatusTransacao;
};

export type AtualizacaoTransacao = Partial<
  Pick<NovaTransacao, 'tipo' | 'valor' | 'categoria' | 'descricao' | 'data'>
>;

type LinhaTransacao = {
  id: number;
  conta_id: number | null;
  cartao_id: number | null;
  tipo: TipoTransacao;
  valor: number;
  categoria: string;
  descricao: string | null;
  data: string;
  status: StatusTransacao;
};

function paraTransacao(linha: LinhaTransacao): Transacao {
  return {
    id: linha.id,
    contaId: linha.conta_id,
    cartaoId: linha.cartao_id,
    tipo: linha.tipo,
    valor: linha.valor,
    categoria: linha.categoria,
    descricao: linha.descricao,
    data: linha.data,
    status: linha.status,
  };
}

export function criarTransacao(db: DbClient, transacao: NovaTransacao): Transacao {
  const resultado = db
    .prepare(
      `INSERT INTO transacoes (conta_id, cartao_id, tipo, valor, categoria, descricao, data, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ativa')`,
    )
    .run(
      transacao.contaId ?? null,
      transacao.cartaoId ?? null,
      transacao.tipo,
      transacao.valor,
      transacao.categoria,
      transacao.descricao ?? null,
      transacao.data,
    );

  return {
    id: Number(resultado.lastInsertRowid),
    contaId: transacao.contaId ?? null,
    cartaoId: transacao.cartaoId ?? null,
    tipo: transacao.tipo,
    valor: transacao.valor,
    categoria: transacao.categoria,
    descricao: transacao.descricao ?? null,
    data: transacao.data,
    status: 'ativa',
  };
}

export function obterTransacao(db: DbClient, id: number): Transacao | undefined {
  const linha = db.prepare('SELECT * FROM transacoes WHERE id = ?').get(id) as
    | LinhaTransacao
    | undefined;
  return linha ? paraTransacao(linha) : undefined;
}

export function atualizarTransacao(
  db: DbClient,
  id: number,
  mudancas: AtualizacaoTransacao,
): Transacao | undefined {
  const campos = Object.keys(mudancas) as (keyof AtualizacaoTransacao)[];
  if (campos.length === 0) {
    return obterTransacao(db, id);
  }

  const colunaPorCampo: Record<keyof AtualizacaoTransacao, string> = {
    tipo: 'tipo',
    valor: 'valor',
    categoria: 'categoria',
    descricao: 'descricao',
    data: 'data',
  };

  const setClause = campos.map((campo) => `${colunaPorCampo[campo]} = ?`).join(', ');
  const valores = campos.map((campo) => mudancas[campo]);

  const resultado = db
    .prepare(`UPDATE transacoes SET ${setClause} WHERE id = ?`)
    .run(...valores, id);

  if (resultado.changes === 0) {
    return undefined;
  }

  return obterTransacao(db, id);
}

export function excluirTransacao(db: DbClient, id: number): boolean {
  const resultado = db
    .prepare("UPDATE transacoes SET status = 'excluida' WHERE id = ? AND status = 'ativa'")
    .run(id);
  return resultado.changes > 0;
}

export type FiltroTransacoes = {
  contaId?: number;
  categoria?: string;
  dataInicio?: string;
  dataFim?: string;
};

export function listarTransacoesAtivas(db: DbClient, filtro: FiltroTransacoes = {}): Transacao[] {
  const condicoes: string[] = ["status = 'ativa'"];
  const params: unknown[] = [];

  if (filtro.contaId !== undefined) {
    condicoes.push('conta_id = ?');
    params.push(filtro.contaId);
  }
  if (filtro.categoria !== undefined) {
    condicoes.push('LOWER(categoria) = LOWER(?)');
    params.push(filtro.categoria);
  }
  if (filtro.dataInicio !== undefined) {
    condicoes.push('data >= ?');
    params.push(filtro.dataInicio);
  }
  if (filtro.dataFim !== undefined) {
    condicoes.push('data <= ?');
    params.push(filtro.dataFim);
  }

  const linhas = db
    .prepare(`SELECT * FROM transacoes WHERE ${condicoes.join(' AND ')} ORDER BY data, id`)
    .all(...params) as LinhaTransacao[];

  return linhas.map(paraTransacao);
}

export function calcularSaldoTransacoesConta(db: DbClient, contaId: number): number {
  const linha = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE -valor END), 0) AS delta
       FROM transacoes WHERE conta_id = ? AND status = 'ativa'`,
    )
    .get(contaId) as { delta: number };
  return linha.delta;
}
