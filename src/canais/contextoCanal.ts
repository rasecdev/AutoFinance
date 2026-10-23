import { InputFile, type Context } from 'grammy';
import { montarTecladoConfirmacao } from '../bot/tecladoConfirmacao.js';

// Interface mínima de saída reaproveitada pelo núcleo de conversa
// (processarMensagemTexto e o que ele chama, texto.ts) — só os métodos que
// esse núcleo de fato usa. Cada canal (Telegram, WhatsApp — Fase 9 Rodada 2)
// implementa por cima do que for nativo dele, sem exigir que o resto de
// src/bot/handlers/* mude. message_id (não messageId) é de propósito: é o
// nome de campo que o Telegram já usa, consumido só pelo rastreio de
// /errado//certo (Telegram-only nesta rodada) — undefined quando o canal não
// tiver esse conceito (ex: WhatsApp), chamador precisa checar antes de usar.
export type RespostaEnviada = {
  message_id?: number;
};

// `pedirConfirmacao` é só um pedido ao canal pra sinalizar "esta mensagem tem
// uma ação pendente de confirmação" — CADA canal decide como realizar isso
// (Telegram: teclado inline anexado nesta mesma mensagem; WhatsApp — Tarefa
// 135 — Poll numa mensagem separada, já que o canal não tem equivalente de
// reply_markup). O núcleo de conversa nunca escolhe a mecânica, só o fato de
// pedir confirmação.
export type OpcoesReply = {
  pedirConfirmacao?: boolean;
};

export type CanalContext = {
  reply(texto: string, opcoes?: OpcoesReply): Promise<RespostaEnviada>;
  replyWithPhoto(imagem: Buffer): Promise<void>;
  replyWithDocument(documento: Buffer, nomeArquivo: string): Promise<void>;
  replyWithChatAction(acao: 'typing'): Promise<void>;
};

// Adapter pro Telegram — grammy exige InputFile (não Buffer crú) pra mandar
// mídia e InputFile não expõe o Buffer de volta (campo interno privado), por
// isso o núcleo de conversa trabalha só com Buffer crú e é este adapter que
// traduz pra forma que o grammy espera, sem mudar nenhum comportamento
// observável do Telegram.
export function criarContextoTelegram(ctx: Context): CanalContext {
  return {
    async reply(texto, opcoes) {
      // Preserva a forma exata de chamada que cada ponto do núcleo já usava
      // antes da Tarefa 130: chamado sem `opcoes` (mensagens de erro/cancelamento,
      // sempre 1 argumento pro grammy) vs. chamado com `opcoes` (resposta
      // principal da IA, sempre 2 argumentos — objeto ou `undefined` explícito).
      const mensagem =
        opcoes === undefined
          ? await ctx.reply(texto)
          : await ctx.reply(texto, opcoes.pedirConfirmacao ? { reply_markup: montarTecladoConfirmacao() } : undefined);
      return { message_id: mensagem.message_id };
    },
    async replyWithPhoto(imagem) {
      await ctx.replyWithPhoto(new InputFile(imagem));
    },
    async replyWithDocument(documento, nomeArquivo) {
      await ctx.replyWithDocument(new InputFile(documento, nomeArquivo));
    },
    async replyWithChatAction(acao) {
      await ctx.replyWithChatAction(acao);
    },
  };
}
