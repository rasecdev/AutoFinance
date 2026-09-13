import type { z } from 'zod';

export type ToolContext = {
  chatId: number;
  modelo?: string;
};

// Formato de retorno do handler de uma tool. A maioria devolve só texto (vai
// pro modelo narrar); gerar_grafico/consultar_e_graficar (Fase 6 parte 10)
// precisam devolver também uma imagem (Buffer PNG) — o texto ainda vai pro
// modelo via role: 'tool', a imagem nunca (é acumulada separadamente e
// enviada como foto no Telegram, ver gerarResposta/executarToolCall em
// openrouter.ts). string continua um caso válido, não substituído.
export type ResultadoTool = string | { texto: string; imagem?: Buffer };

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
  handler: (args: z.infer<Schema>, ctx: ToolContext) => Promise<ResultadoTool>;
};
