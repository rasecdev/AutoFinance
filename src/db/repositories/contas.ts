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
