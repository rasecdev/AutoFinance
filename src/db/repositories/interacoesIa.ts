import type { DbClient } from '../client.js';

export type ResultadoInteracao = 'sucesso' | 'erro' | 'rejeitado';
export type AvaliacaoUsuario = 'correto' | 'incorreto';

export type NovaInteracaoIa = {
  traceId: string;
  fluxo: string;
  modelo: string;
  mensagemUsuario?: string;
  respostaModelo?: string;
  toolCalls?: Array<{ nome: string; argumentos: unknown }>;
  resultado: ResultadoInteracao;
  chatId?: number;
  tokensPrompt?: number;
  tokensCompletion?: number;
};

export type InteracaoIa = {
  id: number;
  traceId: string;
  fluxo: string;
  modelo: string;
  mensagemUsuario: string | null;
  respostaModelo: string | null;
  resultado: ResultadoInteracao;
  chatId: number | null;
  tokensPrompt: number | null;
  tokensCompletion: number | null;
  dataHora: string;
};

type LinhaInteracaoIa = {
  id: number;
  trace_id: string;
  fluxo: string;
  modelo: string;
  mensagem_usuario: string | null;
  resposta_modelo: string | null;
  resultado: ResultadoInteracao;
  chat_id: number | null;
  tokens_prompt: number | null;
  tokens_completion: number | null;
  data_hora: string;
};

function mapearLinha(linha: LinhaInteracaoIa): InteracaoIa {
  return {
    id: linha.id,
    traceId: linha.trace_id,
    fluxo: linha.fluxo,
    modelo: linha.modelo,
    mensagemUsuario: linha.mensagem_usuario,
    respostaModelo: linha.resposta_modelo,
    resultado: linha.resultado,
    chatId: linha.chat_id,
    tokensPrompt: linha.tokens_prompt,
    tokensCompletion: linha.tokens_completion,
    dataHora: linha.data_hora,
  };
}

export function registrarInteracaoIa(db: DbClient, interacao: NovaInteracaoIa): void {
  db.prepare(
    `INSERT INTO interacoes_ia (trace_id, fluxo, modelo, mensagem_usuario, resposta_modelo, tool_calls, resultado, chat_id, tokens_prompt, tokens_completion, data_hora)
     VALUES (@traceId, @fluxo, @modelo, @mensagemUsuario, @respostaModelo, @toolCalls, @resultado, @chatId, @tokensPrompt, @tokensCompletion, @dataHora)`,
  ).run({
    traceId: interacao.traceId,
    fluxo: interacao.fluxo,
    modelo: interacao.modelo,
    mensagemUsuario: interacao.mensagemUsuario ?? null,
    respostaModelo: interacao.respostaModelo ?? null,
    toolCalls:
      interacao.toolCalls && interacao.toolCalls.length > 0 ? JSON.stringify(interacao.toolCalls) : null,
    resultado: interacao.resultado,
    chatId: interacao.chatId ?? null,
    tokensPrompt: interacao.tokensPrompt ?? null,
    tokensCompletion: interacao.tokensCompletion ?? null,
    dataHora: new Date().toISOString(),
  });
}

export function atualizarAvaliacaoInteracao(
  db: DbClient,
  traceId: string,
  avaliacao: AvaliacaoUsuario,
): boolean {
  const resultado = db
    .prepare('UPDATE interacoes_ia SET avaliacao_usuario = ? WHERE trace_id = ?')
    .run(avaliacao, traceId);
  return resultado.changes > 0;
}

function obterIdPorTraceId(db: DbClient, traceId: string): number {
  const linha = db.prepare('SELECT id FROM interacoes_ia WHERE trace_id = ?').get(traceId) as
    | { id: number }
    | undefined;
  return linha?.id ?? 0;
}

export function buscarUltimasInteracoesPorChat(
  db: DbClient,
  chatId: number,
  limite: number,
  desdeTraceId?: string,
): InteracaoIa[] {
  const idMinimo = desdeTraceId !== undefined ? obterIdPorTraceId(db, desdeTraceId) : 0;

  const linhas = db
    .prepare(
      `SELECT * FROM interacoes_ia
       WHERE chat_id = ? AND id > ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(chatId, idMinimo, limite) as LinhaInteracaoIa[];

  return linhas.reverse().map(mapearLinha);
}

export function somarTokensChat(db: DbClient, chatId: number, desdeTraceId?: string): number {
  const idMinimo = desdeTraceId !== undefined ? obterIdPorTraceId(db, desdeTraceId) : 0;

  const resultado = db
    .prepare(
      `SELECT COALESCE(SUM(tokens_prompt), 0) + COALESCE(SUM(tokens_completion), 0) AS total
       FROM interacoes_ia
       WHERE chat_id = ? AND id > ?`,
    )
    .get(chatId, idMinimo) as { total: number };

  return resultado.total;
}

export type InteracaoCorreta = {
  traceId: string;
  mensagemUsuario: string | null;
  toolCalls: Array<{ nome: string; argumentos: unknown }> | null;
};

// Usado pela curadoria de caso de teste do benchmark interno (Fase 6, parte 2):
// promove a última interação que o usuário marcou como correta (/certo) numa
// entrada de casos_teste_benchmark, sem precisar de trace_id explícito.
export function buscarUltimaInteracaoCorreta(db: DbClient, chatId: number): InteracaoCorreta | undefined {
  const linha = db
    .prepare(
      `SELECT trace_id, mensagem_usuario, tool_calls FROM interacoes_ia
       WHERE chat_id = ? AND avaliacao_usuario = 'correto'
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(chatId) as { trace_id: string; mensagem_usuario: string | null; tool_calls: string | null } | undefined;

  if (!linha) return undefined;

  return {
    traceId: linha.trace_id,
    mensagemUsuario: linha.mensagem_usuario,
    toolCalls: linha.tool_calls
      ? (JSON.parse(linha.tool_calls) as Array<{ nome: string; argumentos: unknown }>)
      : null,
  };
}

export function contarInteracoesAvaliadasIncorretas(
  db: DbClient,
  periodo: { inicio: string; fim: string },
): number {
  const resultado = db
    .prepare(
      `SELECT COUNT(*) AS total FROM interacoes_ia
       WHERE avaliacao_usuario = 'incorreto' AND data_hora >= ? AND data_hora <= ?`,
    )
    .get(periodo.inicio, periodo.fim) as { total: number };

  return resultado.total;
}
