import { Bot } from 'grammy';
import type { DbClient } from '../db/client.js';
import { registrarErro } from '../db/repositories/errosExecucao.js';
import type { Logger } from '../logging/logger.js';

// Chamado do catch de cada script de job em background (backup, monitorarPrecos,
// relatorioSemanal, relatorioMensal) — grava o erro em erros_execucao (histórico
// consultável) e avisa na hora via Telegram, em vez de só o console.error/exit
// code de hoje (ver PLANO.md, "Logs e tratamento de erros", item 3). Falha ao
// enviar pra um chat não impede o registro nem os outros envios.
export async function tratarErroCriticoJob(
  db: DbClient,
  logger: Logger,
  contexto: string,
  erro: unknown,
  botToken: string,
  chatIds: string[],
): Promise<void> {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  const detalhes = erro instanceof Error ? erro.stack ?? null : null;

  registrarErro(db, { contexto, mensagem, detalhes });
  logger.error({ err: erro, contexto }, 'erro crítico em job de fundo');

  const bot = new Bot(botToken);
  const texto = `⚠️ Erro crítico no job "${contexto}": ${mensagem}`;

  for (const chatId of chatIds) {
    await bot.api.sendMessage(chatId, texto).catch((erroEnvio: unknown) => {
      logger.error({ err: erroEnvio, chatId }, 'falha ao enviar alerta de erro crítico');
    });
  }
}
