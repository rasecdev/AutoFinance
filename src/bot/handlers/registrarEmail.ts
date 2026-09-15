import type { Context } from 'grammy';
import { google, type Auth } from 'googleapis';
import type { Env } from '../../config/env.js';
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

// Quem tiver esse valor lê o Gmail e mexe no Calendar da conta vinculada até
// alguém revogar o acesso — a mensagem com o token não deveria ficar parada
// no histórico do chat. Auto-apagar é best-effort (setTimeout em memória: se
// o bot reiniciar antes de disparar, a mensagem fica — por isso o aviso pra
// apagar na hora também, não só o timer).
const TEMPO_AUTO_APAGAR_MS = 5 * 60 * 1000;

function agendarAutoApagar(ctx: Context, chatId: number, messageId: number, logger: Logger): void {
  setTimeout(() => {
    ctx.api.deleteMessage(chatId, messageId).catch((erro: unknown) => {
      logger.error({ err: erro, chatId, messageId }, 'falha ao auto-apagar mensagem com refresh_token');
    });
  }, TEMPO_AUTO_APAGAR_MS);
}

export function createHandlerRegistrarEmail(env: Env) {
  return async function handlerRegistrarEmail(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const texto = ctx.message?.text ?? '';
    if (chatId === undefined) {
      return;
    }

    if (!env.googleOAuthClient) {
      await ctx.reply(
        'Ainda não dá pra vincular — faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET configurados no servidor ' +
          '(criados uma vez no Google Cloud Console: projeto → ativar Gmail API e Calendar API → credencial ' +
          'OAuth 2.0 do tipo "Aplicativo para computador"). Isso é feito por quem administra o servidor, não por ' +
          'aqui — depois de configurado, "/registrar_email" passa a funcionar.',
      );
      return;
    }

    if (env.google && !PEDE_REAUTORIZACAO.test(texto)) {
      await ctx.reply(
        `Este ambiente já tem uma conta Google vinculada (agenda: "${env.google.calendarId}") — cobre leitura de ` +
          'fatura/boleto por e-mail e criação de eventos de vencimento no Calendar, os dois já ativos.\n\n' +
          'Se quiser vincular outra conta mesmo assim (o vínculo antigo continua funcionando até você trocar o ' +
          'GOOGLE_REFRESH_TOKEN de verdade), digite "/registrar_email confirmar".',
      );
      return;
    }

    const oauth2Client = new google.auth.OAuth2(
      env.googleOAuthClient.clientId,
      env.googleOAuthClient.clientSecret,
      REDIRECT_URI,
    );
    const url = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });

    definirPendenciaOAuthGoogle(chatId, oauth2Client);

    await ctx.reply(
      'Vamos vincular sua conta Google. Uma única autorização resolve as DUAS integrações de uma vez: leitura ' +
        'automática de fatura/boleto de e-mail (Gmail, só leitura) e criação de eventos de vencimento (Google ' +
        'Calendar) — mesma conta, mesmo passo, nada a repetir depois.\n\n' +
        `1. Abra este link e faça login com a conta Google que você quer usar:\n${url}\n\n` +
        '2. O Google vai mostrar os dois pedidos de permissão (ler Gmail, gerenciar eventos do Calendar) — são ' +
        'exatamente os dois escopos que o bot usa, nada além disso. Autorize.\n\n' +
        '3. O navegador vai tentar abrir "http://localhost/?code=..." e vai dar erro de página não encontrada — ' +
        'isso é esperado, não se preocupe. Copie o valor que vem depois de "code=" na barra de endereço (até o ' +
        '"&" seguinte, se houver mais parâmetros).\n\n' +
        '4. Cole esse código aqui nesta conversa, como uma mensagem normal.\n\n' +
        'O vínculo fica pendente só nesta conversa até você colar o código (ou até o bot reiniciar — nesse caso é ' +
        'só rodar "/registrar_email" de novo).',
    );
  };
}

export function createHandlerCodigoOAuthGoogle(logger: Logger) {
  return async function handlerCodigoOAuthGoogle(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const codigo = ctx.message?.text?.trim();
    if (chatId === undefined || !codigo) {
      return;
    }

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
      await ctx.reply(
        'Não consegui trocar esse código por um token — ele pode ter expirado (a validade é curta) ou ter sido ' +
          'colado incompleto. Rode "/registrar_email" de novo pra gerar um link novo.',
      );
      return;
    }

    if (!tokens.refresh_token) {
      await ctx.reply(
        'A autorização deu certo, mas o Google não devolveu um refresh_token dessa vez — normalmente acontece ' +
          'quando essa conta já autorizou este mesmo app antes sem revogar o acesso. Revogue o acesso em ' +
          'https://myaccount.google.com/permissions (procure o nome do app) e rode "/registrar_email confirmar" de novo.',
      );
      return;
    }

    const mensagemComToken = await ctx.reply(
      'Autorização concluída dos dois lados (Gmail + Calendar). Falta só um passo manual: alguém com acesso ao ' +
        'servidor precisa colar isto em GOOGLE_REFRESH_TOKEN no .env deste ambiente e reiniciar os serviços ' +
        '"ler-email-faturas" e "sincronizar-calendario". Depois disso os dois recursos passam a funcionar sozinhos, ' +
        `sem precisar rodar esse comando de novo:\n\n${tokens.refresh_token}\n\n` +
        '⚠️ Assim que copiar, apague esta mensagem (quem tiver esse valor acessa seu Gmail/Calendar até você ' +
        'revogar o acesso) — como garantia extra, ela se apaga sozinha em 5 minutos.',
    );

    agendarAutoApagar(ctx, chatId, mensagemComToken.message_id, logger);
  };
}
