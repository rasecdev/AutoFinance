import type { DbClient } from '../client.js';
import { criarParcela, type Parcela } from './parcelas.js';

export type TipoDivida = 'emprestimo' | 'financiamento' | 'consignado' | 'outro';
export type SistemaAmortizacao = 'price' | 'sac';
export type Indexador = 'fixo' | 'ipca' | 'cdi' | 'selic' | 'tr' | 'outro';
export type PeriodicidadeReajuste = 'mensal' | 'anual' | 'nenhuma';
export type StatusDivida = 'ativo' | 'quitado' | 'renegociado';

export type NovaDivida = {
  contaId: number;
  tipo: TipoDivida;
  valorTotal: number;
  numParcelas: number;
  taxaJuros?: number;
  sistemaAmortizacao?: SistemaAmortizacao;
  indexador?: Indexador;
  taxaIndexadorSpread?: number;
  periodicidadeReajuste?: PeriodicidadeReajuste;
  dataInicio: string;
  descricao?: string;
};

export type Divida = {
  id: number;
  contaId: number;
  tipo: TipoDivida;
  valorTotal: number;
  numParcelas: number;
  valorParcela: number;
  parcelasPagas: number;
  taxaJuros: number | null;
  sistemaAmortizacao: SistemaAmortizacao | null;
  indexador: Indexador;
  taxaIndexadorSpread: number | null;
  periodicidadeReajuste: PeriodicidadeReajuste;
  dataInicio: string;
  status: StatusDivida;
  descricao: string | null;
};

// Primeira parcela vence um mês após data_inicio (data da contratação/liberação),
// convenção padrão de cronograma de amortização.
function somarMeses(dataISO: string, meses: number): string {
  const partes = dataISO.split('-').map(Number);
  const ano = partes[0] ?? 0;
  const mes = partes[1] ?? 1;
  const dia = partes[2] ?? 1;
  const data = new Date(ano, mes - 1 + meses, dia);
  const anoResultado = data.getFullYear();
  const mesResultado = String(data.getMonth() + 1).padStart(2, '0');
  const diaResultado = String(data.getDate()).padStart(2, '0');
  return `${anoResultado}-${mesResultado}-${diaResultado}`;
}

function parcelaPrice(saldo: number, taxa: number, parcelas: number): number {
  if (parcelas <= 0) return 0;
  if (taxa === 0) return saldo / parcelas;
  return (saldo * taxa) / (1 - (1 + taxa) ** -parcelas);
}

export function gerarValoresParcelas(
  valorTotal: number,
  numParcelas: number,
  taxaJuros: number | undefined,
  sistemaAmortizacao: SistemaAmortizacao | undefined,
): number[] {
  const taxa = taxaJuros ?? 0;

  if (sistemaAmortizacao === 'sac') {
    const amortizacaoConstante = valorTotal / numParcelas;
    return Array.from({ length: numParcelas }, (_, indice) => {
      const saldoAntes = valorTotal - amortizacaoConstante * indice;
      return amortizacaoConstante + saldoAntes * taxa;
    });
  }

  // Price, ou sistema de amortização não informado: parcelas de valor fixo
  // (sem sistema definido, sem juros compostos — só divide o total igualmente).
  const valor = sistemaAmortizacao === 'price' ? parcelaPrice(valorTotal, taxa, numParcelas) : valorTotal / numParcelas;
  return Array.from({ length: numParcelas }, () => valor);
}

type LinhaDivida = {
  id: number;
  conta_id: number;
  tipo: TipoDivida;
  valor_total: number;
  num_parcelas: number;
  valor_parcela: number;
  parcelas_pagas: number;
  taxa_juros: number | null;
  sistema_amortizacao: SistemaAmortizacao | null;
  indexador: Indexador;
  taxa_indexador_spread: number | null;
  periodicidade_reajuste: PeriodicidadeReajuste;
  data_inicio: string;
  status: StatusDivida;
  descricao: string | null;
};

const COLUNAS_DIVIDA = `id, conta_id, tipo, valor_total, num_parcelas, valor_parcela, parcelas_pagas, taxa_juros,
       sistema_amortizacao, indexador, taxa_indexador_spread, periodicidade_reajuste, data_inicio, status, descricao`;

function paraDivida(linha: LinhaDivida): Divida {
  return {
    id: linha.id,
    contaId: linha.conta_id,
    tipo: linha.tipo,
    valorTotal: linha.valor_total,
    numParcelas: linha.num_parcelas,
    valorParcela: linha.valor_parcela,
    parcelasPagas: linha.parcelas_pagas,
    taxaJuros: linha.taxa_juros,
    sistemaAmortizacao: linha.sistema_amortizacao,
    indexador: linha.indexador,
    taxaIndexadorSpread: linha.taxa_indexador_spread,
    periodicidadeReajuste: linha.periodicidade_reajuste,
    dataInicio: linha.data_inicio,
    status: linha.status,
    descricao: linha.descricao,
  };
}

export function obterDivida(db: DbClient, id: number): Divida | undefined {
  const linha = db.prepare(`SELECT ${COLUNAS_DIVIDA} FROM dividas WHERE id = ?`).get(id) as
    | LinhaDivida
    | undefined;
  return linha ? paraDivida(linha) : undefined;
}

// Dívida não tem apelido próprio como conta/cartão — é identificada por
// conta + tipo; descricao (opcional, dado quando existir mais de uma do
// mesmo tipo na mesma conta) desambigua (ver "Princípio de referência por
// apelido/contexto" no PLANO.md).
// Só considera dívidas ativas — uma já quitada/renegociada não é um alvo válido
// pra identificar por conta+tipo (senão uma renegociação bem-sucedida deixaria
// a dívida antiga "fantasma" disputando ambiguidade com a nova).
export function buscarDividasPorContaETipo(db: DbClient, contaId: number, tipo: TipoDivida): Divida[] {
  const linhas = db
    .prepare(`SELECT ${COLUNAS_DIVIDA} FROM dividas WHERE conta_id = ? AND tipo = ? AND status = 'ativo' ORDER BY id`)
    .all(contaId, tipo) as LinhaDivida[];
  return linhas.map(paraDivida);
}

export function marcarDividaRenegociada(db: DbClient, id: number): void {
  db.prepare("UPDATE dividas SET status = 'renegociado' WHERE id = ?").run(id);
}

export function criarDivida(db: DbClient, divida: NovaDivida): { divida: Divida; parcelas: Parcela[] } {
  const valores = gerarValoresParcelas(divida.valorTotal, divida.numParcelas, divida.taxaJuros, divida.sistemaAmortizacao);
  const valorParcela = valores[0] ?? 0;
  const indexador = divida.indexador ?? 'fixo';
  const periodicidadeReajuste = divida.periodicidadeReajuste ?? 'nenhuma';

  const criarTudo = db.transaction(() => {
    const resultado = db
      .prepare(
        `INSERT INTO dividas (
           conta_id, tipo, valor_total, num_parcelas, valor_parcela, taxa_juros,
           sistema_amortizacao, indexador, taxa_indexador_spread, periodicidade_reajuste, data_inicio, descricao
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        divida.contaId,
        divida.tipo,
        divida.valorTotal,
        divida.numParcelas,
        valorParcela,
        divida.taxaJuros ?? null,
        divida.sistemaAmortizacao ?? null,
        indexador,
        divida.taxaIndexadorSpread ?? null,
        periodicidadeReajuste,
        divida.dataInicio,
        divida.descricao ?? null,
      );

    const dividaId = Number(resultado.lastInsertRowid);

    const parcelas = valores.map((valor, indice) =>
      criarParcela(db, {
        dividaId,
        numeroParcela: indice + 1,
        valor,
        dataVencimento: somarMeses(divida.dataInicio, indice + 1),
      }),
    );

    return { dividaId, parcelas };
  })();

  return {
    divida: {
      id: criarTudo.dividaId,
      contaId: divida.contaId,
      tipo: divida.tipo,
      valorTotal: divida.valorTotal,
      numParcelas: divida.numParcelas,
      valorParcela,
      parcelasPagas: 0,
      taxaJuros: divida.taxaJuros ?? null,
      sistemaAmortizacao: divida.sistemaAmortizacao ?? null,
      indexador,
      taxaIndexadorSpread: divida.taxaIndexadorSpread ?? null,
      periodicidadeReajuste,
      dataInicio: divida.dataInicio,
      status: 'ativo',
      descricao: divida.descricao ?? null,
    },
    parcelas: criarTudo.parcelas,
  };
}
