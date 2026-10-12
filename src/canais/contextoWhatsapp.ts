import type { CanalContext, RespostaEnviada } from './contextoCanal.js';
import {
  enviarDocumentoWhatsapp,
  enviarImagemWhatsapp,
  enviarTextoWhatsapp,
  type ConfigWhatsapp,
} from './whatsapp.js';
import type { Logger } from '../logging/logger.js';

// Implementação da interface mínima (CanalContext, Tarefa 130) por cima dos
// clientes WAHA já existentes da Rodada 1. message_id nunca existe aqui — é
// conceito só do Telegram (rastreio de /errado//certo, fora de escopo pro
// WhatsApp nesta rodada), por isso reply sempre devolve {} (sem message_id).
// Erro de envio é logado (mesmo padrão de notificar.ts) e relançado — ao
// contrário de notificar.ts (mensagem proativa, "best effort"), aqui é uma
// resposta síncrona dentro de uma conversa ativa, e o núcleo (processarMensagemTexto)
// já trata falha de reply como qualquer outro erro de execução.
export function criarContextoWhatsapp(
  config: ConfigWhatsapp,
  destinatario: string,
  logger: Logger,
): CanalContext {
  return {
    async reply(texto, opcoes): Promise<RespostaEnviada> {
      // Poll de confirmação entra na Tarefa 135 — por ora, pedirConfirmacao
      // ainda não tem mecânica própria no WhatsApp, só manda o texto.
      if (opcoes?.pedirConfirmacao) {
        logger.warn('pedirConfirmacao ainda sem Poll no WhatsApp (Tarefa 135) — mandando só o texto');
      }

      try {
        await enviarTextoWhatsapp(config, destinatario, texto);
      } catch (erro) {
        logger.error({ err: erro, destinatario }, 'falha ao enviar texto por WhatsApp');
        throw erro;
      }
      return {};
    },
    async replyWithPhoto(imagem): Promise<void> {
      try {
        await enviarImagemWhatsapp(config, destinatario, imagem);
      } catch (erro) {
        logger.error({ err: erro, destinatario }, 'falha ao enviar imagem por WhatsApp');
        throw erro;
      }
    },
    async replyWithDocument(documento, nomeArquivo): Promise<void> {
      try {
        await enviarDocumentoWhatsapp(config, destinatario, documento, nomeArquivo);
      } catch (erro) {
        logger.error({ err: erro, destinatario }, 'falha ao enviar documento por WhatsApp');
        throw erro;
      }
    },
    // Sem endpoint de "digitando..." confirmado contra a API real da WAHA —
    // no-op por ora, não bloqueia a tarefa (ver tasks/todo.md, Tarefa 133).
    async replyWithChatAction(): Promise<void> {
      return undefined;
    },
  };
}
