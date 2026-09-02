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
};

export function registrarInteracaoIa(db: DbClient, interacao: NovaInteracaoIa): void {
  db.prepare(
    `INSERT INTO interacoes_ia (trace_id, fluxo, modelo, mensagem_usuario, resposta_modelo, tool_calls, resultado, data_hora)
     VALUES (@traceId, @fluxo, @modelo, @mensagemUsuario, @respostaModelo, @toolCalls, @resultado, @dataHora)`,
  ).run({
    traceId: interacao.traceId,
    fluxo: interacao.fluxo,
    modelo: interacao.modelo,
    mensagemUsuario: interacao.mensagemUsuario ?? null,
    respostaModelo: interacao.respostaModelo ?? null,
    toolCalls:
      interacao.toolCalls && interacao.toolCalls.length > 0 ? JSON.stringify(interacao.toolCalls) : null,
    resultado: interacao.resultado,
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
