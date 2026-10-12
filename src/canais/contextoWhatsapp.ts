import { OPCOES_POLL_CONFIRMACAO, PERGUNTA_POLL_CONFIRMACAO } from '../bot/confirmacao.js';
import type { CanalContext, RespostaEnviada } from './contextoCanal.js';
import {
  enviarDocumentoWhatsapp,
  enviarImagemWhatsapp,
  enviarPollWhatsapp,
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
      try {
        await enviarTextoWhatsapp(config, destinatario, texto);
        // Poll é mensagem própria, separada do texto — equivalente ao
        // teclado inline do Telegram (anexado na mesma mensagem lá, mas a
        // WAHA não tem esse conceito pra texto simples).
        if (opcoes?.pedirConfirmacao) {
          await enviarPollWhatsapp(config, destinatario, PERGUNTA_POLL_CONFIRMACAO, OPCOES_POLL_CONFIRMACAO);
        }
      } catch (erro) {
        logger.error({ err: erro, destinatario }, 'falha ao enviar texto/Poll por WhatsApp');
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
