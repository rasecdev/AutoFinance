import type { DbClient } from '../client.js';

export type StatusDespesaFixa = 'ativa' | 'pausada';

export type NovaDespesaFixa = {
  contaId: number;
  cartaoId?: number;
  descricao: string;
  categoria: string;
  valorEsperado: number;
  diaVencimentoEsperado: number;
  criadoEm: string;
};

export type DespesaFixa = {
  id: number;
  contaId: number;
  cartaoId: number | null;
  descricao: string;
  categoria: string;
  valorEsperado: number;
  diaVencimentoEsperado: number;
  origem: 'email' | 'manual';
  remetenteEmail: string | null;
  status: StatusDespesaFixa;
  criadoEm: string;
};

export type AtualizacaoDespesaFixa = Partial<
  Pick<DespesaFixa, 'valorEsperado' | 'diaVencimentoEsperado' | 'status'>
>;

type LinhaDespesaFixa = {
  id: number;
  conta_id: number;
  cartao_id: number | null;
  descricao: string;
  categoria: string;
  valor_esperado: number;
  dia_vencimento_esperado: number;
  origem: 'email' | 'manual';
  remetente_email: string | null;
  status: StatusDespesaFixa;
  criado_em: string;
};

function paraDespesaFixa(linha: LinhaDespesaFixa): DespesaFixa {
  return {
    id: linha.id,
    contaId: linha.conta_id,
    cartaoId: linha.cartao_id,
    descricao: linha.descricao,
    categoria: linha.categoria,
    valorEsperado: linha.valor_esperado,
    diaVencimentoEsperado: linha.dia_vencimento_esperado,
    origem: linha.origem,
    remetenteEmail: linha.remetente_email,
    status: linha.status,
    criadoEm: linha.criado_em,
  };
}

export function criarDespesaFixa(db: DbClient, despesa: NovaDespesaFixa): DespesaFixa {
  const resultado = db
    .prepare(
      `INSERT INTO despesas_fixas
         (conta_id, cartao_id, descricao, categoria, valor_esperado, dia_vencimento_esperado, origem, status, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, 'manual', 'ativa', ?)`,
    )
    .run(
      despesa.contaId,
      despesa.cartaoId ?? null,
      despesa.descricao,
      despesa.categoria,
      despesa.valorEsperado,
      despesa.diaVencimentoEsperado,
      despesa.criadoEm,
    );

  return {
    id: Number(resultado.lastInsertRowid),
    contaId: despesa.contaId,
    cartaoId: despesa.cartaoId ?? null,
    descricao: despesa.descricao,
    categoria: despesa.categoria,
    valorEsperado: despesa.valorEsperado,
    diaVencimentoEsperado: despesa.diaVencimentoEsperado,
    origem: 'manual',
    remetenteEmail: null,
    status: 'ativa',
    criadoEm: despesa.criadoEm,
  };
}

export function obterDespesaFixa(db: DbClient, id: number): DespesaFixa | undefined {
  const linha = db.prepare('SELECT * FROM despesas_fixas WHERE id = ?').get(id) as
    | LinhaDespesaFixa
    | undefined;
  return linha ? paraDespesaFixa(linha) : undefined;
}

// Despesa fixa não tem apelido próprio — identificada por conta + descrição
// (mesmo princípio de referência por conta+contexto já usado em dívida,
// resolverDividaId), então a busca por conta precisa cobrir qualquer status
// (uma despesa pausada ainda precisa ser encontrável pra reativar).
export function buscarDespesasFixasPorConta(db: DbClient, contaId: number): DespesaFixa[] {
  const linhas = db
    .prepare('SELECT * FROM despesas_fixas WHERE conta_id = ? ORDER BY descricao')
    .all(contaId) as LinhaDespesaFixa[];
  return linhas.map(paraDespesaFixa);
}

export function atualizarDespesaFixa(
  db: DbClient,
  id: number,
  mudancas: AtualizacaoDespesaFixa,
): DespesaFixa | undefined {
  const campos = Object.keys(mudancas) as (keyof AtualizacaoDespesaFixa)[];
  if (campos.length === 0) {
    return obterDespesaFixa(db, id);
  }

  const colunaPorCampo: Record<keyof AtualizacaoDespesaFixa, string> = {
    valorEsperado: 'valor_esperado',
    diaVencimentoEsperado: 'dia_vencimento_esperado',
    status: 'status',
  };

  const setClause = campos.map((campo) => `${colunaPorCampo[campo]} = ?`).join(', ');
  const valores = campos.map((campo) => mudancas[campo]);

  const resultado = db
    .prepare(`UPDATE despesas_fixas SET ${setClause} WHERE id = ?`)
    .run(...valores, id);

  if (resultado.changes === 0) {
    return undefined;
  }

  return obterDespesaFixa(db, id);
}
