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
  eventoCalendarioId: string | null;
};

type LinhaFatura = {
  id: number;
  cartao_id: number;
  conta_id: number;
  mes_referencia: string;
  valor: number;
  status: StatusFatura;
  data_pagamento: string | null;
  evento_calendario_id: string | null;
};

const COLUNAS_FATURA = 'f.id, f.cartao_id, c.conta_id, f.mes_referencia, f.valor, f.status, f.data_pagamento, f.evento_calendario_id';

function paraFatura(linha: LinhaFatura): Fatura {
  return {
    id: linha.id,
    cartaoId: linha.cartao_id,
    contaId: linha.conta_id,
    mesReferencia: linha.mes_referencia,
    valor: linha.valor,
    status: linha.status,
    dataPagamento: linha.data_pagamento,
    eventoCalendarioId: linha.evento_calendario_id,
  };
}

export function obterFatura(db: DbClient, id: number): Fatura | undefined {
  const linha = db
    .prepare(
      `SELECT ${COLUNAS_FATURA}
       FROM faturas f
       JOIN cartoes c ON c.id = f.cartao_id
       WHERE f.id = ?`,
    )
    .get(id) as LinhaFatura | undefined;
  return linha ? paraFatura(linha) : undefined;
}

export function atualizarEventoCalendarioFatura(db: DbClient, id: number, eventoCalendarioId: string | null): void {
  db.prepare('UPDATE faturas SET evento_calendario_id = ? WHERE id = ?').run(eventoCalendarioId, id);
}

export type NovaFatura = {
  cartaoId: number;
  mesReferencia: string;
  valor: number;
  status?: StatusFatura;
};

// Usado por registrar_fatura_email (Fase 7): primeira vez que uma fatura é
// criada fora de seed/renegociação — até então faturas só existiam via
// dado inicial ou nova dívida de renegociação.
export function criarFatura(db: DbClient, fatura: NovaFatura): Fatura {
  const resultado = db
    .prepare('INSERT INTO faturas (cartao_id, mes_referencia, valor, status) VALUES (?, ?, ?, ?)')
    .run(fatura.cartaoId, fatura.mesReferencia, fatura.valor, fatura.status ?? 'aberta');

  const criada = obterFatura(db, Number(resultado.lastInsertRowid));
  if (!criada) {
    throw new Error('fatura recém-criada não encontrada');
  }
  return criada;
}

export function atualizarValorFatura(db: DbClient, id: number, valor: number): void {
  db.prepare('UPDATE faturas SET valor = ? WHERE id = ?').run(valor, id);
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
      `SELECT ${COLUNAS_FATURA}
       FROM faturas f
       JOIN cartoes c ON c.id = f.cartao_id
       WHERE f.cartao_id = ? AND f.mes_referencia = ?`,
    )
    .get(cartaoId, mesReferencia) as LinhaFatura | undefined;
  return linha ? paraFatura(linha) : undefined;
}

export type FaturaAbertaComVencimento = Fatura & { diaVencimento: number };

type LinhaFaturaComVencimento = LinhaFatura & { dia_vencimento: number };

// Usado por projetar_fluxo_caixa (Fase 6, parte 9): diaVencimento do cartão
// já embutido evita uma segunda consulta pra calcular a data de vencimento
// projetada da fatura (mes_referencia + dia_vencimento). Também usado por
// sincronizarCalendario (Fase 7) pra saber o vencimento de cada fatura aberta.
export function listarFaturasAbertas(db: DbClient, contaId?: number): FaturaAbertaComVencimento[] {
  const sql = `SELECT ${COLUNAS_FATURA}, c.dia_vencimento
               FROM faturas f
               JOIN cartoes c ON c.id = f.cartao_id
               WHERE f.status = 'aberta'${contaId !== undefined ? ' AND c.conta_id = ?' : ''}`;
  const linhas = (contaId !== undefined ? db.prepare(sql).all(contaId) : db.prepare(sql).all()) as LinhaFaturaComVencimento[];

  return linhas.map((linha) => ({ ...paraFatura(linha), diaVencimento: linha.dia_vencimento }));
}

// Usado por sincronizarCalendario (Fase 7): faturas que já tiveram evento
// criado, mas deixaram de estar em aberto (paga/renegociada) desde o último
// ciclo — o evento de vencimento não faz mais sentido, precisa ser removido.
export function listarFaturasComEventoParaRemover(db: DbClient): Fatura[] {
  const linhas = db
    .prepare(
      `SELECT ${COLUNAS_FATURA}
       FROM faturas f
       JOIN cartoes c ON c.id = f.cartao_id
       WHERE f.status != 'aberta' AND f.evento_calendario_id IS NOT NULL`,
    )
    .all() as LinhaFatura[];
  return linhas.map(paraFatura);
}
