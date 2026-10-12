import type { Context } from 'grammy';
import { google, type Auth } from 'googleapis';
import { criarContextoTelegram, type CanalContext } from '../../canais/contextoCanal.js';
import type { Env } from '../../config/env.js';
import type { DbClient } from '../../db/client.js';
import { obterRefreshToken, salvarRefreshToken } from '../../db/repositories/credenciaisGoogle.js';
import { obterIdioma, type Idioma } from '../../db/repositories/idiomaBot.js';
import { t } from '../../i18n/t.js';
import type { Logger } from '../../logging/logger.js';
import {
  definirPendenciaOAuthGoogle,
  obterPendenciaOAuthGoogle,
  removerPendenciaOAuthGoogle,
} from '../googleOAuthPendencia.js';

// Mesmos dois escopos pedidos numa autorização só — não tem como vincular só
// e-mail ou só calendário, é sempre os dois juntos (mesma conta Google,
// mesmo par cliente, ver tasks/plan.md "Fase 7", Architecture Decisions).
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

// Redirect URI fixo pra apps instalados/desktop — não existe servidor
// ouvindo em localhost aqui, o Google só usa esse valor pra formar a URL de
// retorno; o "código" fica visível na barra de endereço mesmo a página
// dando erro de conexão (mesmo esquema do script manual
// configurarGoogleOAuth.ts, agora também pelo Telegram).
const REDIRECT_URI = 'http://localhost';

const PEDE_REAUTORIZACAO = /\bconfirmar\b/i;

// Monta o client OAuth, gera a URL de autorização e marca a pendência pro
// chat -- reaproveitado tanto pelo handler de /registrar_email quanto pelo
// lembrete automático (src/bot/lembreteReautorizacaoGoogle.ts), que precisa
// do mesmo link+pendência sem passar por uma mensagem do Telegram.
export function montarLinkVinculoGoogle(
  googleOAuthClient: NonNullable<Env['googleOAuthClient']>,
  chatId: number | string,
): string {
  const oauth2Client = new google.auth.OAuth2(
    googleOAuthClient.clientId,
    googleOAuthClient.clientSecret,
    REDIRECT_URI,
  );
  const url = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });

  definirPendenciaOAuthGoogle(chatId, oauth2Client);

  return url;
}

export function montarMensagemVinculoGoogle(url: string, idioma: Idioma = 'pt'): string {
  return t('email_vinculo_mensagem', idioma, { url });
}

// Núcleo reaproveitado pelo handler do Telegram e, desde a Tarefa 136, pelo
// roteamento do webhook do WhatsApp — só depende da interface mínima
// (CanalContext, Tarefa 130), nunca do Context largo do grammy.
export async function processarRegistrarEmail(
  ctx: CanalContext,
  env: Pick<Env, 'googleOAuthClient'>,
  db: DbClient,
  chatId: number | string,
  texto: string,
): Promise<void> {
  const idioma = obterIdioma(db);

  if (!env.googleOAuthClient) {
    await ctx.reply(t('email_sem_env', idioma));
    return;
  }

  if (obterRefreshToken(db) !== null && !PEDE_REAUTORIZACAO.test(texto)) {
    await ctx.reply(t('email_ja_vinculado', idioma, { calendarId: env.googleOAuthClient.calendarId }));
    return;
  }

  const url = montarLinkVinculoGoogle(env.googleOAuthClient, chatId);

  await ctx.reply(montarMensagemVinculoGoogle(url, idioma));
}

export function createHandlerRegistrarEmail(env: Env, db: DbClient) {
  return async function handlerRegistrarEmail(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const texto = ctx.message?.text ?? '';
    if (chatId === undefined) {
      return;
    }

    await processarRegistrarEmail(criarContextoTelegram(ctx), env, db, chatId, texto);
  };
}

export async function processarCodigoOAuthGoogle(
  ctx: CanalContext,
  db: DbClient,
  logger: Logger,
  chatId: number | string,
  codigo: string,
): Promise<void> {
  const idioma = obterIdioma(db);

  const oauth2Client = obterPendenciaOAuthGoogle(chatId);
  if (!oauth2Client) {
    return;
  }
  removerPendenciaOAuthGoogle(chatId);

  let tokens: Auth.Credentials;
  try {
    ({ tokens } = await oauth2Client.getToken(codigo));
  } catch (erro) {
    logger.error({ err: erro, chatId }, 'falha ao trocar código OAuth do Google por token');
    await ctx.reply(t('email_codigo_invalido', idioma));
    return;
  }

  if (!tokens.refresh_token) {
    await ctx.reply(t('email_sem_refresh_token', idioma));
    return;
  }

  salvarRefreshToken(db, tokens.refresh_token);

  await ctx.reply(t('email_vinculo_concluido', idioma));
}

export function createHandlerCodigoOAuthGoogle(db: DbClient, logger: Logger) {
  return async function handlerCodigoOAuthGoogle(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const codigo = ctx.message?.text?.trim();
    if (chatId === undefined || !codigo) {
      return;
    }

    await processarCodigoOAuthGoogle(criarContextoTelegram(ctx), db, logger, chatId, codigo);
  };
}
