import type { Logger } from './logger.js';

export function registerGlobalErrorHandlers(logger: Logger): void {
  process.on('uncaughtException', (erro) => {
    logger.error({ err: erro }, 'uncaughtException — processo continua rodando');
  });

  process.on('unhandledRejection', (motivo) => {
    logger.error({ err: motivo }, 'unhandledRejection — processo continua rodando');
  });
}
