import type { z } from 'zod';

export type ToolContext = {
  chatId: number;
};

export type ToolDefinition<Schema extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  schema: Schema;
  requerConfirmacao?: boolean;
  handler: (args: z.infer<Schema>, ctx: ToolContext) => Promise<string>;
};
