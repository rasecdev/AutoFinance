import { Bot, InputFile } from 'grammy';
import type { Env } from '../config/env.js';
import type { Logger } from '../logging/logger.js';
import {
  enviarDocumentoWhatsapp,
  enviarImagemWhatsapp,
  enviarTextoWhatsapp,
  type ConfigWhatsapp,
} from './whatsapp.js';

// Fan-out de envio proativo (Fase 9, Rodada 1): manda por Telegram, como os
// scripts já fazem hoje, e, se o WhatsApp estiver configurado (env.whatsapp,
// ausente = integração desligada), manda a mesma mensagem por lá também pra
// cada número em destinatarios. Falha num canal nunca impede o outro nem
// lança pro chamador — mesmo princípio de tratarErroCriticoJob.ts: loga e
// segue, sem exigir try/catch de quem chama.

function configWhatsapp(
  env: Pick<Env, 'whatsapp'>,
): { config: ConfigWhatsapp; destinatarios: string[] } | null {
  if (!env.whatsapp) {
    return null;
  }

  const { wahaUrl, wahaApiKey, wahaSession, destinatarios } = env.whatsapp;
  return { config: { url: wahaUrl, apiKey: wahaApiKey, session: wahaSession }, destinatarios };
}

export async function notificarTexto(
  env: Pick<Env, 'whatsapp'>,
  bot: Bot,
  chatIds: string[],
  texto: string,
  logger: Logger,
): Promise<void> {
  for (const chatId of chatIds) {
    await bot.api.sendMessage(chatId, texto).catch((erro: unknown) => {
      logger.error({ err: erro, chatId }, 'falha ao enviar mensagem por Telegram');
    });
  }

  const whatsapp = configWhatsapp(env);
  if (!whatsapp) {
    return;
  }

  for (const destinatario of whatsapp.destinatarios) {
    await enviarTextoWhatsapp(whatsapp.config, destinatario, texto).catch((erro: unknown) => {
      logger.error({ err: erro, destinatario }, 'falha ao enviar mensagem por WhatsApp');
    });
  }
}

export async function notificarImagem(
  env: Pick<Env, 'whatsapp'>,
  bot: Bot,
  chatIds: string[],
  imagem: Buffer,
  logger: Logger,
  legenda?: string,
): Promise<void> {
  for (const chatId of chatIds) {
    await bot.api
      .sendPhoto(chatId, new InputFile(imagem), legenda ? { caption: legenda } : undefined)
      .catch((erro: unknown) => {
        logger.error({ err: erro, chatId }, 'falha ao enviar imagem por Telegram');
      });
  }

  const whatsapp = configWhatsapp(env);
  if (!whatsapp) {
    return;
  }

  for (const destinatario of whatsapp.destinatarios) {
    await enviarImagemWhatsapp(whatsapp.config, destinatario, imagem, legenda).catch((erro: unknown) => {
      logger.error({ err: erro, destinatario }, 'falha ao enviar imagem por WhatsApp');
    });
  }
}

export async function notificarDocumento(
  env: Pick<Env, 'whatsapp'>,
  bot: Bot,
  chatIds: string[],
  documento: Buffer,
  nomeArquivo: string,
  logger: Logger,
): Promise<void> {
  for (const chatId of chatIds) {
    await bot.api.sendDocument(chatId, new InputFile(documento, nomeArquivo)).catch((erro: unknown) => {
      logger.error({ err: erro, chatId }, 'falha ao enviar documento por Telegram');
    });
  }

  const whatsapp = configWhatsapp(env);
  if (!whatsapp) {
    return;
  }

  for (const destinatario of whatsapp.destinatarios) {
    await enviarDocumentoWhatsapp(whatsapp.config, destinatario, documento, nomeArquivo).catch((erro: unknown) => {
      logger.error({ err: erro, destinatario }, 'falha ao enviar documento por WhatsApp');
    });
  }
}
