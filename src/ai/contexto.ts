import type OpenAI from 'openai';
import type { DbClient } from '../db/client.js';
import { buscarUltimasInteracoesPorChat } from '../db/repositories/interacoesIa.js';
import { obterUltimoResumo } from '../db/repositories/resumosConversa.js';

// PLANO.md sugere 10-15 turnos como ponto de partida ("a validar na prática").
export const LIMITE_TURNOS_JANELA = 12;

export function montarHistorico(
  db: DbClient,
  chatId: number,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const resumo = obterUltimoResumo(db, chatId);
  const interacoes = buscarUltimasInteracoesPorChat(
    db,
    chatId,
    LIMITE_TURNOS_JANELA,
    resumo?.cobreAteTraceId,
  );

  const mensagens: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  if (resumo) {
    mensagens.push({
      role: 'system',
      content: `Resumo da conversa até aqui (turnos mais antigos, compactados): ${resumo.resumoTexto}`,
    });
  }

  for (const interacao of interacoes) {
    if (interacao.mensagemUsuario) {
      mensagens.push({ role: 'user', content: interacao.mensagemUsuario });
    }
    if (interacao.respostaModelo) {
      mensagens.push({ role: 'assistant', content: interacao.respostaModelo });
    }
  }

  return mensagens;
}
