import { z } from 'zod';

const chatIdListSchema = z
  .string()
  .min(1, 'TELEGRAM_ALLOWED_CHAT_IDS não pode ser vazio')
  .transform((value) => value.split(',').map((id) => id.trim()))
  .pipe(z.array(z.string().min(1)).min(1));

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

const GOOGLE_PAR_CLIENTE = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const;
const PLUGGY_PAR_CLIENTE = ['PLUGGY_CLIENT_ID', 'PLUGGY_CLIENT_SECRET'] as const;

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
    PLUGGY_CLIENT_ID: z.string().min(1).optional(),
    PLUGGY_CLIENT_SECRET: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    // CLIENT_ID/CLIENT_SECRET sempre juntos ou nenhum dos dois — mas sem
    // REFRESH_TOKEN ainda é um estado válido (par cadastrado no Google Cloud,
    // vínculo ainda não feito via /registrar_email — ver googleOAuthClient).
    const parPresente = GOOGLE_PAR_CLIENTE.filter((nome) => data[nome] !== undefined);
    if (parPresente.length > 0 && parPresente.length < GOOGLE_PAR_CLIENTE.length) {
      const faltando = GOOGLE_PAR_CLIENTE.filter((nome) => data[nome] === undefined);
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE'],
        message: `integração Google incompleta — faltando: ${faltando.join(', ')}`,
      });
    }

    // REFRESH_TOKEN sozinho não faz sentido — token pertence a um par
    // cliente específico, exige os dois presentes.
    if (data.GOOGLE_REFRESH_TOKEN !== undefined && parPresente.length < GOOGLE_PAR_CLIENTE.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE'],
        message: 'GOOGLE_REFRESH_TOKEN exige GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET configurados',
      });
    }

    // Mesmo padrão do par Google (Fase 7, Tarefa 90): os dois juntos ou
    // nenhum dos dois — ausentes por completo é estado válido (integração
    // desligada, Fase 8 ainda não conectada em nenhuma conta).
    const parPluggyPresente = PLUGGY_PAR_CLIENTE.filter((nome) => data[nome] !== undefined);
    if (parPluggyPresente.length > 0 && parPluggyPresente.length < PLUGGY_PAR_CLIENTE.length) {
      const faltando = PLUGGY_PAR_CLIENTE.filter((nome) => data[nome] === undefined);
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PLUGGY'],
        message: `integração Pluggy incompleta — faltando: ${faltando.join(', ')}`,
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
  // Presente sempre que o par cliente OAuth existe, mesmo sem refresh token
  // ainda — é o que o comando /registrar_email usa pra saber se pode iniciar
  // um vínculo novo (google, acima, só fica preenchido depois de vinculado).
  googleOAuthClient: {
    clientId: string;
    clientSecret: string;
  } | null;
  // Fase 8 (Open Finance) — ausente = integração desligada (estado válido,
  // sobretudo antes de qualquer conta ser conectada); mesmo padrão de
  // googleOAuthClient acima.
  pluggy: {
    clientId: string;
    clientSecret: string;
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

  const googleOAuthClient =
    parsed.GOOGLE_CLIENT_ID && parsed.GOOGLE_CLIENT_SECRET
      ? { clientId: parsed.GOOGLE_CLIENT_ID, clientSecret: parsed.GOOGLE_CLIENT_SECRET }
      : null;

  const google =
    googleOAuthClient && parsed.GOOGLE_REFRESH_TOKEN
      ? {
          ...googleOAuthClient,
          refreshToken: parsed.GOOGLE_REFRESH_TOKEN,
          calendarId: parsed.GOOGLE_CALENDAR_ID ?? 'primary',
        }
      : null;

  const pluggy =
    parsed.PLUGGY_CLIENT_ID && parsed.PLUGGY_CLIENT_SECRET
      ? { clientId: parsed.PLUGGY_CLIENT_ID, clientSecret: parsed.PLUGGY_CLIENT_SECRET }
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
    googleOAuthClient,
    pluggy,
  };
}
