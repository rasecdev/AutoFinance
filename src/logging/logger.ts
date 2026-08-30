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

export function createLogger(destination?: DestinationStream): Logger {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: {
        paths: CAMPOS_SENSIVEIS,
        censor: '[REDACTED]',
      },
    },
    destination,
  );
}

export const logger = createLogger();

export function withTraceId(traceId: string): Logger {
  return logger.child({ traceId });
}
