import pino, { type DestinationStream } from 'pino';

export const CAMPOS_SENSIVEIS = [
  'token',
  '*.token',
  'telegramBotToken',
  '*.telegramBotToken',
  'apiKey',
  '*.apiKey',
  'openrouterApiKey',
  '*.openrouterApiKey',
  'databaseEncryptionKey',
  '*.databaseEncryptionKey',
  'numeroConta',
  '*.numeroConta',
];

export type Logger = pino.Logger;

export function createLogger(destination?: DestinationStream, level = 'info'): Logger {
  return pino(
    {
      level,
      redact: {
        paths: CAMPOS_SENSIVEIS,
        censor: '[REDACTED]',
      },
    },
    destination,
  );
}

export function withTraceId(logger: Logger, traceId: string): Logger {
  return logger.child({ traceId });
}
