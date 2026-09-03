import type { Bot, Context } from 'grammy';

export type Handler = (ctx: Context) => Promise<void>;

// Matching de comando por conta própria (case-insensitive), em vez de
// bot.command('errado', ...): o matching nativo do grammY é case-sensitive,
// e teclados de celular costumam autocapitalizar a primeira letra da
// mensagem ("/Errado") — achado real de teste manual, ver PROGRESSO.md.
const COMANDO_ERRADO = /^\/errado\b/i;
const COMANDO_CERTO = /^\/certo\b/i;
const COMANDO_MODELO = /^\/modelo\b/i;

export function registerRoutes(
  bot: Bot,
  handlerTexto: Handler,
  handlerMidia: Handler,
  handlerNaoSuportado: Handler,
  handlerFeedback: Handler,
  handlerFeedbackCorreto: Handler,
  handlerModelo: Handler,
): void {
  bot.on('message:text').filter(
    (ctx) => COMANDO_ERRADO.test(ctx.message.text.trim()),
    handlerFeedback,
  );
  bot.on('message:text').filter(
    (ctx) => COMANDO_CERTO.test(ctx.message.text.trim()),
    handlerFeedbackCorreto,
  );
  bot.on('message:text').filter(
    (ctx) => COMANDO_MODELO.test(ctx.message.text.trim()),
    handlerModelo,
  );
  bot.on('message:text', handlerTexto);
  bot.on(['message:photo', 'message:document'], handlerMidia);
  bot.on('message', handlerNaoSuportado);
}
