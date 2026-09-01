import type { DbClient } from '../client.js';

export type TipoConta = 'PF' | 'PJ';

export type NovaConta = {
  bancoNome: string;
  tipo: TipoConta;
  apelido: string;
  saldoInicial?: number;
};

export type Conta = {
  id: number;
  bancoId: number;
  tipo: TipoConta;
  apelido: string;
  saldoAtual: number;
};

function obterOuCriarBanco(db: DbClient, nome: string): number {
  const existente = db.prepare('SELECT id FROM bancos WHERE nome = ?').get(nome) as
    | { id: number }
    | undefined;
  if (existente) {
    return existente.id;
  }

  const resultado = db.prepare('INSERT INTO bancos (nome) VALUES (?)').run(nome);
  return Number(resultado.lastInsertRowid);
}

export function criarConta(db: DbClient, conta: NovaConta): Conta {
  const bancoId = obterOuCriarBanco(db, conta.bancoNome);
  const saldoAtual = conta.saldoInicial ?? 0;

  const resultado = db
    .prepare('INSERT INTO contas (banco_id, tipo, apelido, saldo_atual) VALUES (?, ?, ?, ?)')
    .run(bancoId, conta.tipo, conta.apelido, saldoAtual);

  return {
    id: Number(resultado.lastInsertRowid),
    bancoId,
    tipo: conta.tipo,
    apelido: conta.apelido,
    saldoAtual,
  };
}

export function contaExiste(db: DbClient, id: number): boolean {
  const linha = db.prepare('SELECT 1 FROM contas WHERE id = ?').get(id);
  return linha !== undefined;
}

export function obterConta(db: DbClient, id: number): Conta | undefined {
  const linha = db
    .prepare('SELECT id, banco_id, tipo, apelido, saldo_atual FROM contas WHERE id = ?')
    .get(id) as LinhaConta | undefined;
  return linha ? paraConta(linha) : undefined;
}

type LinhaConta = {
  id: number;
  banco_id: number;
  tipo: TipoConta;
  apelido: string;
  saldo_atual: number;
};

function paraConta(linha: LinhaConta): Conta {
  return {
    id: linha.id,
    bancoId: linha.banco_id,
    tipo: linha.tipo,
    apelido: linha.apelido,
    saldoAtual: linha.saldo_atual,
  };
}

export function buscarContaPorApelido(db: DbClient, apelido: string): Conta[] {
  const linhas = db
    .prepare('SELECT id, banco_id, tipo, apelido, saldo_atual FROM contas WHERE LOWER(apelido) = LOWER(?)')
    .all(apelido) as LinhaConta[];

  return linhas.map(paraConta);
}

// Nome parcial (ex: "nubank" pra uma conta apelidada "Nubank PJ") não é erro
// de digitação — busca aproximada por distância de edição não pega isso.
// Contenção de substring cobre, sem risco de adivinhar: mais de um resultado
// cai na mesma lógica de ambiguidade já usada pra apelido exato.
export function buscarContaPorApelidoParcial(db: DbClient, textoParcial: string): Conta[] {
  const linhas = db
    .prepare("SELECT id, banco_id, tipo, apelido, saldo_atual FROM contas WHERE LOWER(apelido) LIKE '%' || LOWER(?) || '%'")
    .all(textoParcial) as LinhaConta[];

  return linhas.map(paraConta);
}

export function listarContas(db: DbClient): Conta[] {
  const linhas = db
    .prepare('SELECT id, banco_id, tipo, apelido, saldo_atual FROM contas ORDER BY apelido')
    .all() as LinhaConta[];

  return linhas.map(paraConta);
}
