import type { z } from 'zod';

export type ToolContext = {
  chatId: number;
};

export type ToolDefinition<Schema extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  schema: Schema;
  requerConfirmacao?: boolean;
  // Texto extra (ex: estimativa calculada, aviso de dívida indexada) anexado à
  // pergunta de confirmação genérica, antes do usuário responder "sim" — só
  // ferramentas de alto impacto com algo a mostrar além dos parâmetros crus
  // precisam disso (ex: amortizar_divida).
  avisoConfirmacao?: (args: z.infer<Schema>) => string | undefined;
  handler: (args: z.infer<Schema>, ctx: ToolContext) => Promise<string>;
};
