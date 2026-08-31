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
