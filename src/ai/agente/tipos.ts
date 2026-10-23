import type { PendenciaConfirmacao } from '../confirmacao/pendencias.js';
import type { ToolDefinition } from '../tools/types.js';

export type ToolCallRegistrada = {
  nome: string;
  argumentos: unknown;
};

export type DocumentoTool = { buffer: Buffer; nomeArquivo: string };

export type RespostaGerada = {
  modelo: string;
  resposta: string;
  toolCalls: ToolCallRegistrada[];
  imagens: Buffer[];
  documentos: DocumentoTool[];
  tokensPrompt: number;
  tokensCompletion: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  custoReal: number;
  duracaoMs: number;
  pendenciaConfirmacao?: PendenciaConfirmacao;
};

export type ResultadoToolCall =
  | { tipo: 'executado'; conteudo: string; imagem?: Buffer; documento?: DocumentoTool; argumentos: unknown }
  | { tipo: 'pendente_confirmacao'; tool: ToolDefinition; argumentos: unknown };
