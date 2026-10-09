import { Bot } from 'grammy';
import { configurarFormatacaoPadrao } from '../bot/formatoMensagens.js';
import { notificarTexto } from '../canais/notificar.js';
import type { Env } from '../config/env.js';
import type { DbClient } from '../db/client.js';
import { registrarErro } from '../db/repositories/errosExecucao.js';
import type { Logger } from '../logging/logger.js';

// Chamado do catch de cada script de job em background (backup, monitorarPrecos,
// relatorioSemanal, relatorioMensal, etc.) — grava o erro em erros_execucao
// (histórico consultável) e avisa na hora via notificarTexto (Telegram e,
// se configurado, WhatsApp também — Fase 9), em vez de só o console.error/exit
// code de hoje (ver PLANO.md, "Logs e tratamento de erros", item 3). Falha ao
// enviar pra um canal não impede o registro nem os outros envios (já garantido
// por notificarTexto). Recebe só o recorte de Env que usa, não o tipo inteiro —
// permite chamadores que não têm acesso ao Env completo (ex: dentro de um loop
// de item, em renovarSandboxPluggy.ts) montar um objeto mínimo.
export async function tratarErroCriticoJob(
  db: DbClient,
  logger: Logger,
  contexto: string,
  erro: unknown,
  env: Pick<Env, 'telegramBotToken' | 'telegramAllowedChatIds' | 'whatsapp'>,
): Promise<void> {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  const detalhes = erro instanceof Error ? erro.stack ?? null : null;

  registrarErro(db, { contexto, mensagem, detalhes });
  logger.error({ err: erro, contexto }, 'erro crítico em job de fundo');

  const bot = new Bot(env.telegramBotToken);
  configurarFormatacaoPadrao(bot);
  const texto = `⚠️ Erro crítico no job "${contexto}": ${mensagem}`;

  await notificarTexto(env, bot, env.telegramAllowedChatIds, texto, logger);
}
