import type { DbClient } from '../client.js';

export type ResultadoInteracao = 'sucesso' | 'erro' | 'rejeitado';

export type NovaInteracaoIa = {
  traceId: string;
  fluxo: string;
  modelo: string;
  mensagemUsuario?: string;
  respostaModelo?: string;
  resultado: ResultadoInteracao;
};

export function registrarInteracaoIa(db: DbClient, interacao: NovaInteracaoIa): void {
  db.prepare(
    `INSERT INTO interacoes_ia (trace_id, fluxo, modelo, mensagem_usuario, resposta_modelo, resultado, data_hora)
     VALUES (@traceId, @fluxo, @modelo, @mensagemUsuario, @respostaModelo, @resultado, @dataHora)`,
  ).run({
    traceId: interacao.traceId,
    fluxo: interacao.fluxo,
    modelo: interacao.modelo,
    mensagemUsuario: interacao.mensagemUsuario ?? null,
    respostaModelo: interacao.respostaModelo ?? null,
    resultado: interacao.resultado,
    dataHora: new Date().toISOString(),
  });
}
