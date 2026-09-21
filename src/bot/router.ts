import type { Bot, Context } from 'grammy';
import { COMANDOS_BOT } from './comandos.js';
import { obterPendenciaOAuthGoogle } from './googleOAuthPendencia.js';
import { obterPendenciaOpenFinance } from './openFinancePendencia.js';

export type Handler = (ctx: Context) => Promise<void>;

// Matching de comando por conta própria (case-insensitive), em vez de
// bot.command('errado', ...): o matching nativo do grammY é case-sensitive,
// e teclados de celular costumam autocapitalizar a primeira letra da
// mensagem ("/Errado") — achado real de teste manual, ver PROGRESSO.md.
// Regex de cada comando vem de COMANDOS_BOT (comandos.ts), fonte única
// compartilhada com o menu "/" do Telegram (setMyCommands, em index.ts).

export function registerRoutes(
  bot: Bot,
  handlerTexto: Handler,
  handlerMidia: Handler,
  handlerVoz: Handler,
  handlerNaoSuportado: Handler,
  handlerFeedback: Handler,
  handlerFeedbackCorreto: Handler,
  handlerModelo: Handler,
  handlerModelos: Handler,
  handlerRegistrarEmail: Handler,
  handlerCodigoOAuthGoogle: Handler,
  handlerAjuda: Handler,
  handlerRegistrarOpenFinance: Handler,
  handlerMapeamentoOpenFinance: Handler,
  handlerCallbackConfirmacao: Handler,
): void {
  const handlersPorComando: Record<string, Handler> = {
    errado: handlerFeedback,
    certo: handlerFeedbackCorreto,
    modelos: handlerModelos,
    modelo: handlerModelo,
    registrar_email: handlerRegistrarEmail,
    ajuda: handlerAjuda,
    registrar_open_finance: handlerRegistrarOpenFinance,
  };

  for (const { comando, regex } of COMANDOS_BOT) {
    const handler = handlersPorComando[comando];
    if (!handler) {
      throw new Error(`comando "${comando}" (comandos.ts) sem handler mapeado em registerRoutes`);
    }
    bot.on('message:text').filter((ctx) => regex.test(ctx.message.text.trim()), handler);
  }
  // Vínculo Google pendente pro chat (aguardando o código colado de volta)
  // tem prioridade sobre o pipeline normal de conversa, mas fica depois dos
  // comandos acima — "/registrar_email" de novo sempre regenera o link, em
  // vez de ser interpretado como o código colado.
  bot.on('message:text').filter(
    (ctx) => ctx.chat?.id !== undefined && obterPendenciaOAuthGoogle(ctx.chat.id) !== undefined,
    handlerCodigoOAuthGoogle,
  );
  // Mesmo princípio, pro mapeamento de conta pendente do /registrar_open_finance
  // (Fase 8) — também fica depois dos comandos, "/registrar_open_finance" de
  // novo sempre gera uma lista nova em vez de ser interpretado como mapeamento.
  bot.on('message:text').filter(
    (ctx) => ctx.chat?.id !== undefined && obterPendenciaOpenFinance(ctx.chat.id) !== undefined,
    handlerMapeamentoOpenFinance,
  );
  bot.on('message:text', handlerTexto);
  bot.on(['message:photo', 'message:document'], handlerMidia);
  bot.on('message:voice', handlerVoz);
  bot.on('message', handlerNaoSuportado);
  // Clique nos botões Sim/Cancelar da confirmação (achado real: digitar
  // "sim" era confuso pra alguns usuários) — roda fora do fluxo de mensagem
  // de texto, é um tipo de update diferente (callback_query).
  bot.on('callback_query:data', handlerCallbackConfirmacao);
}
