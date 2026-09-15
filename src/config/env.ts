import { z } from 'zod';

const chatIdListSchema = z
  .string()
  .min(1, 'TELEGRAM_ALLOWED_CHAT_IDS não pode ser vazio')
  .transform((value) => value.split(',').map((id) => id.trim()))
  .pipe(z.array(z.string().min(1)).min(1));

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

const GOOGLE_GRUPO = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'] as const;

const envSchema = z
  .object({
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
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    GOOGLE_REFRESH_TOKEN: z.string().min(1).optional(),
    GOOGLE_CALENDAR_ID: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    const presentes = GOOGLE_GRUPO.filter((nome) => data[nome] !== undefined);

    if (presentes.length > 0 && presentes.length < GOOGLE_GRUPO.length) {
      const faltando = GOOGLE_GRUPO.filter((nome) => data[nome] === undefined);
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE'],
        message: `integração Google incompleta — faltando: ${faltando.join(', ')}`,
      });
    }
  });

export type Env = {
  ambiente: 'producao' | 'homologacao';
  telegramBotToken: string;
  telegramAllowedChatIds: string[];
  openrouterApiKey: string;
  databasePath: string;
  databaseEncryptionKey: string;
  logLevel: (typeof LOG_LEVELS)[number];
  google: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    calendarId: string;
  } | null;
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

  const google =
    parsed.GOOGLE_CLIENT_ID && parsed.GOOGLE_CLIENT_SECRET && parsed.GOOGLE_REFRESH_TOKEN
      ? {
          clientId: parsed.GOOGLE_CLIENT_ID,
          clientSecret: parsed.GOOGLE_CLIENT_SECRET,
          refreshToken: parsed.GOOGLE_REFRESH_TOKEN,
          calendarId: parsed.GOOGLE_CALENDAR_ID ?? 'primary',
        }
      : null;

  return {
    ambiente: parsed.AMBIENTE,
    telegramBotToken: parsed.TELEGRAM_BOT_TOKEN,
    telegramAllowedChatIds: parsed.TELEGRAM_ALLOWED_CHAT_IDS,
    openrouterApiKey: parsed.OPENROUTER_API_KEY,
    databasePath: parsed.DATABASE_PATH,
    databaseEncryptionKey: parsed.DATABASE_ENCRYPTION_KEY,
    logLevel: parsed.LOG_LEVEL,
    google,
  };
}
