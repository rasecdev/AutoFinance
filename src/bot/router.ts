import type { Bot, Context } from 'grammy';

export type Handler = (ctx: Context) => Promise<void>;

export function registerRoutes(bot: Bot, handlerTexto: Handler, handlerMidia: Handler): void {
  bot.on('message:text', handlerTexto);
  bot.on(['message:photo', 'message:document'], handlerMidia);
}
