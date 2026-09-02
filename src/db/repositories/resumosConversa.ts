import type { DbClient } from '../client.js';

export type NovoResumoConversa = {
  chatId: number;
  resumoTexto: string;
  cobreAteTraceId: string;
  tokensJanelaNoGatilho: number;
};

export type ResumoConversa = {
  id: number;
  chatId: number;
  resumoTexto: string;
  cobreAteTraceId: string;
  tokensJanelaNoGatilho: number;
  criadoEm: string;
};

type LinhaResumoConversa = {
  id: number;
  chat_id: number;
  resumo_texto: string;
  cobre_ate_trace_id: string;
  tokens_janela_no_gatilho: number;
  criado_em: string;
};

function mapearLinha(linha: LinhaResumoConversa): ResumoConversa {
  return {
    id: linha.id,
    chatId: linha.chat_id,
    resumoTexto: linha.resumo_texto,
    cobreAteTraceId: linha.cobre_ate_trace_id,
    tokensJanelaNoGatilho: linha.tokens_janela_no_gatilho,
    criadoEm: linha.criado_em,
  };
}

export function criarResumoConversa(db: DbClient, resumo: NovoResumoConversa): void {
  db.prepare(
    `INSERT INTO resumos_conversa (chat_id, resumo_texto, cobre_ate_trace_id, tokens_janela_no_gatilho, criado_em)
     VALUES (@chatId, @resumoTexto, @cobreAteTraceId, @tokensJanelaNoGatilho, @criadoEm)`,
  ).run({
    chatId: resumo.chatId,
    resumoTexto: resumo.resumoTexto,
    cobreAteTraceId: resumo.cobreAteTraceId,
    tokensJanelaNoGatilho: resumo.tokensJanelaNoGatilho,
    criadoEm: new Date().toISOString(),
  });
}

export function obterUltimoResumo(db: DbClient, chatId: number): ResumoConversa | undefined {
  const linha = db
    .prepare('SELECT * FROM resumos_conversa WHERE chat_id = ? ORDER BY id DESC LIMIT 1')
    .get(chatId) as LinhaResumoConversa | undefined;

  return linha === undefined ? undefined : mapearLinha(linha);
}
