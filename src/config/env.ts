import { z } from 'zod';

const chatIdListSchema = z
  .string()
  .min(1, 'TELEGRAM_ALLOWED_CHAT_IDS não pode ser vazio')
  .transform((value) => value.split(',').map((id) => id.trim()))
  .pipe(z.array(z.string().min(1)).min(1));

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

const envSchema = z.object({
  AMBIENTE: z.enum(['producao', 'homologacao']),
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN é obrigatório'),
  TELEGRAM_ALLOWED_CHAT_IDS: chatIdListSchema,
  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY é obrigatório'),
  DATABASE_PATH: z.string().min(1, 'DATABASE_PATH é obrigatório'),
  DATABASE_ENCRYPTION_KEY: z.string().min(1, 'DATABASE_ENCRYPTION_KEY é obrigatório'),
  LOG_LEVEL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(LOG_LEVELS).default('info'),
  ),
});

export type Env = {
  ambiente: 'producao' | 'homologacao';
  telegramBotToken: string;
  telegramAllowedChatIds: string[];
  openrouterApiKey: string;
  databasePath: string;
  databaseEncryptionKey: string;
  logLevel: (typeof LOG_LEVELS)[number];
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const detalhes = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuração de ambiente inválida — ${detalhes}`);
  }

  const parsed = result.data;

  return {
    ambiente: parsed.AMBIENTE,
    telegramBotToken: parsed.TELEGRAM_BOT_TOKEN,
    telegramAllowedChatIds: parsed.TELEGRAM_ALLOWED_CHAT_IDS,
    openrouterApiKey: parsed.OPENROUTER_API_KEY,
    databasePath: parsed.DATABASE_PATH,
    databaseEncryptionKey: parsed.DATABASE_ENCRYPTION_KEY,
    logLevel: parsed.LOG_LEVEL,
  };
}
