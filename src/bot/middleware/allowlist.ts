import type { Context, NextFunction } from 'grammy';
import type { Logger } from '../../logging/logger.js';

export function createAllowlistMiddleware(allowedChatIds: string[], logger: Logger) {
  const permitidos = new Set(allowedChatIds);

  return async function allowlist(ctx: Context, next: NextFunction): Promise<void> {
    const chatId = ctx.chat?.id;

    if (chatId === undefined || !permitidos.has(String(chatId))) {
      logger.warn({ chatId }, 'mensagem de chat_id fora da allowlist ignorada');
      return;
    }

    await next();
  };
}
