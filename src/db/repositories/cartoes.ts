import type { DbClient } from '../client.js';

export type NovoCartao = {
  contaId: number;
  nome: string;
  limite: number;
  diaFechamento: number;
  diaVencimento: number;
};

export type Cartao = NovoCartao & { id: number };

export function criarCartao(db: DbClient, cartao: NovoCartao): Cartao {
  const resultado = db
    .prepare(
      'INSERT INTO cartoes (conta_id, nome, limite, dia_fechamento, dia_vencimento) VALUES (?, ?, ?, ?, ?)',
    )
    .run(cartao.contaId, cartao.nome, cartao.limite, cartao.diaFechamento, cartao.diaVencimento);

  return { id: Number(resultado.lastInsertRowid), ...cartao };
}

export function cartaoExiste(db: DbClient, id: number): boolean {
  const linha = db.prepare('SELECT 1 FROM cartoes WHERE id = ?').get(id);
  return linha !== undefined;
}

type LinhaCartao = {
  id: number;
  conta_id: number;
  nome: string;
  limite: number;
  dia_fechamento: number;
  dia_vencimento: number;
};

function paraCartao(linha: LinhaCartao): Cartao {
  return {
    id: linha.id,
    contaId: linha.conta_id,
    nome: linha.nome,
    limite: linha.limite,
    diaFechamento: linha.dia_fechamento,
    diaVencimento: linha.dia_vencimento,
  };
}

export function buscarCartaoPorNome(db: DbClient, nome: string): Cartao[] {
  const linhas = db
    .prepare(
      'SELECT id, conta_id, nome, limite, dia_fechamento, dia_vencimento FROM cartoes WHERE LOWER(nome) = LOWER(?)',
    )
    .all(nome) as LinhaCartao[];

  return linhas.map(paraCartao);
}

export function listarCartoes(db: DbClient): Cartao[] {
  const linhas = db
    .prepare('SELECT id, conta_id, nome, limite, dia_fechamento, dia_vencimento FROM cartoes ORDER BY nome')
    .all() as LinhaCartao[];

  return linhas.map(paraCartao);
}

export function buscarCartaoPorNomeNaConta(db: DbClient, contaId: number, nome: string): Cartao | undefined {
  const linha = db
    .prepare(
      'SELECT id, conta_id, nome, limite, dia_fechamento, dia_vencimento FROM cartoes WHERE conta_id = ? AND LOWER(nome) = LOWER(?)',
    )
    .get(contaId, nome) as LinhaCartao | undefined;

  return linha ? paraCartao(linha) : undefined;
}
