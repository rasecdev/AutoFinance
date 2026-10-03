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
    GOOGLE_CALENDAR_ID: z.string().min(1).optional(),
    PLUGGY_CLIENT_ID: z.string().min(1).optional(),
    PLUGGY_CLIENT_SECRET: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    // CLIENT_ID/CLIENT_SECRET sempre juntos ou nenhum dos dois. O
    // refresh_token não mora mais em env (migrado pro banco, tabela
    // credenciais_google — ver src/db/repositories/credenciaisGoogle.ts e o
    // achado de invalid_grant em PROGRESSO.md, 2026-10-01/02); vínculo ainda
    // não feito via /registrar_email é só "par presente, sem token no banco
    // ainda" — estado válido, checado em runtime, não aqui.
    const parPresente = GOOGLE_PAR_CLIENTE.filter((nome) => data[nome] !== undefined);
    if (parPresente.length > 0 && parPresente.length < GOOGLE_PAR_CLIENTE.length) {
      const faltando = GOOGLE_PAR_CLIENTE.filter((nome) => data[nome] === undefined);
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE'],
        message: `integração Google incompleta — faltando: ${faltando.join(', ')}`,
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
  // Presente sempre que o par cliente OAuth existe no .env (identidade do app
  // registrado no Google Cloud — estática, não rotaciona), independente de já
  // haver vínculo feito. O refresh_token (o valor que rotaciona/expira) vem do
  // banco (src/db/repositories/credenciaisGoogle.ts), não daqui — é o que o
  // comando /registrar_email usa pra saber se pode iniciar um vínculo novo e
  // os jobs usam pra montar o client junto com o token lido do banco.
  googleOAuthClient: {
    clientId: string;
    clientSecret: string;
    calendarId: string;
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
      ? {
          clientId: parsed.GOOGLE_CLIENT_ID,
          clientSecret: parsed.GOOGLE_CLIENT_SECRET,
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
    googleOAuthClient,
    pluggy,
  };
}
