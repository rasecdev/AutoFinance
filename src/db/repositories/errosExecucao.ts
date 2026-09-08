import type { DbClient } from '../client.js';
import type { PeriodoRelatorio } from '../../relatorios/financeiro.js';

export type NovoErroExecucao = {
  contexto: string;
  mensagem: string;
  detalhes?: string | null;
  traceId?: string | null;
};

export type ErroExecucao = {
  id: number;
  traceId: string | null;
  contexto: string;
  mensagem: string;
  detalhes: string | null;
  dataHora: string;
  resolvido: boolean;
};

type LinhaErroExecucao = {
  id: number;
  trace_id: string | null;
  contexto: string;
  mensagem: string;
  detalhes: string | null;
  data_hora: string;
  resolvido: number;
};

function mapearLinha(linha: LinhaErroExecucao): ErroExecucao {
  return {
    id: linha.id,
    traceId: linha.trace_id,
    contexto: linha.contexto,
    mensagem: linha.mensagem,
    detalhes: linha.detalhes,
    dataHora: linha.data_hora,
    resolvido: linha.resolvido === 1,
  };
}

export function registrarErro(db: DbClient, erro: NovoErroExecucao): ErroExecucao {
  const dataHora = new Date().toISOString();

  const resultado = db
    .prepare(
      'INSERT INTO erros_execucao (trace_id, contexto, mensagem, detalhes, data_hora, resolvido) VALUES (?, ?, ?, ?, ?, 0)',
    )
    .run(erro.traceId ?? null, erro.contexto, erro.mensagem, erro.detalhes ?? null, dataHora);

  return {
    id: Number(resultado.lastInsertRowid),
    traceId: erro.traceId ?? null,
    contexto: erro.contexto,
    mensagem: erro.mensagem,
    detalhes: erro.detalhes ?? null,
    dataHora,
    resolvido: false,
  };
}

// Mesmo achado real documentado em usoIa.ts: PeriodoRelatorio usa data pura
// (AAAA-MM-DD) no fuso local do processo, diferente do timestamp UTC completo
// gravado em data_hora — só concatenar "T00:00:00.000Z" quebra em qualquer
// fuso != UTC. Construir os limites via componentes locais e converter com
// toISOString() dá o instante UTC correto. listarErros/contarErrosPeriodo
// recebem sempre a data pura e convertem internamente, pra não exigir do
// chamador saber desse detalhe de formato.
function paraData(dataISO: string, hora: number, minuto: number, segundo: number, ms: number): Date {
  const partes = dataISO.split('-').map(Number);
  const ano = partes[0] ?? 0;
  const mes = partes[1] ?? 1;
  const dia = partes[2] ?? 1;
  return new Date(ano, mes - 1, dia, hora, minuto, segundo, ms);
}

function paraJanelaTimestamp(periodo: PeriodoRelatorio): { inicio: string; fim: string } {
  return {
    inicio: paraData(periodo.inicio, 0, 0, 0, 0).toISOString(),
    fim: paraData(periodo.fim, 23, 59, 59, 999).toISOString(),
  };
}

export function listarErros(db: DbClient, periodo: PeriodoRelatorio): ErroExecucao[] {
  const janela = paraJanelaTimestamp(periodo);

  const linhas = db
    .prepare('SELECT * FROM erros_execucao WHERE data_hora >= ? AND data_hora <= ? ORDER BY id DESC')
    .all(janela.inicio, janela.fim) as LinhaErroExecucao[];

  return linhas.map(mapearLinha);
}

export function contarErrosPeriodo(db: DbClient, periodo: PeriodoRelatorio): number {
  const janela = paraJanelaTimestamp(periodo);

  const resultado = db
    .prepare('SELECT COUNT(*) AS total FROM erros_execucao WHERE data_hora >= ? AND data_hora <= ?')
    .get(janela.inicio, janela.fim) as { total: number };

  return resultado.total;
}
