import type { Bot } from 'grammy';
import type { Env } from '../config/env.js';
import type { DbClient } from '../db/client.js';
import { obterIdioma, type Idioma } from '../db/repositories/idiomaBot.js';
import { obterUltimoEnvio, registrarEnvio } from '../db/repositories/lembreteReautorizacaoGoogle.js';
import { t } from '../i18n/t.js';
import type { Logger } from '../logging/logger.js';
import { montarLinkVinculoGoogle, montarMensagemVinculoGoogle } from './handlers/registrarEmail.js';

// 5 dias de margem antes do refresh_token expirar (~7 dias em app OAuth não
// publicado, ver PROGRESSO.md 2026-10-01/02/03) -- bem dentro do limite de 32
// bits do setTimeout (~24,8 dias), não precisa do encadeamento de
// dormirAte.ts (feito pra atrasos maiores que isso).
const INTERVALO_MS = 5 * 24 * 60 * 60 * 1000;

function montarMensagemLembrete(url: string, idioma: Idioma): string {
  return t('lembrete_reautorizacao_prefixo', idioma) + montarMensagemVinculoGoogle(url, idioma);
}

// Roda dentro do processo principal do bot, não como serviço separado --
// a pendência OAuth (googleOAuthPendencia.ts) é um Map em memória do mesmo
// processo que roteia as mensagens recebidas (router.ts), então precisa
// viver aqui pra funcionar quando o usuário colar o código de volta (ver
// tasks/plan.md, Architecture Decisions).
export function iniciarLembreteReautorizacaoGoogle(bot: Bot, env: Env, db: DbClient, logger: Logger): void {
  if (!env.googleOAuthClient) {
    return;
  }
  const googleOAuthClient = env.googleOAuthClient;

  async function enviarLembretes(): Promise<void> {
    const idioma = obterIdioma(db);
    for (const chatIdStr of env.telegramAllowedChatIds) {
      const chatId = Number(chatIdStr);
      try {
        const url = montarLinkVinculoGoogle(googleOAuthClient, chatId);
        await bot.api.sendMessage(chatId, montarMensagemLembrete(url, idioma));
      } catch (erro) {
        logger.error({ err: erro, chatId }, 'falha ao enviar lembrete de reautorização do Google');
      }
    }
    registrarEnvio(db);
    agendarProximoCiclo();
  }

  function agendarProximoCiclo(): void {
    const ultimoEnvio = obterUltimoEnvio(db);
    // Sem envio ainda, a base é "agora" -- o primeiro lembrete só dispara 5
    // dias depois de o processo subir com essa feature, não imediatamente
    // (evita um link redundante assim que alguém acabou de vincular na mão).
    const base = ultimoEnvio ?? new Date();
    const delay = Math.max(0, base.getTime() + INTERVALO_MS - Date.now());

    setTimeout(() => {
      void enviarLembretes();
    }, delay);
  }

  agendarProximoCiclo();
}
