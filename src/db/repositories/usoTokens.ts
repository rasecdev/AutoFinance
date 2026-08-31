import type { DbClient } from '../client.js';

export type OrigemUsoTokens = 'uso_real' | 'benchmark_interno';

export type NovoUsoTokens = {
  fluxo: string;
  modelo: string;
  tokensPrompt: number;
  tokensCompletion: number;
  custoEstimado: number;
  origem: OrigemUsoTokens;
};

export function registrarUsoTokens(db: DbClient, usoTokens: NovoUsoTokens): void {
  db.prepare(
    `INSERT INTO uso_tokens (fluxo, modelo, tokens_prompt, tokens_completion, custo_estimado, origem, data_hora)
     VALUES (@fluxo, @modelo, @tokensPrompt, @tokensCompletion, @custoEstimado, @origem, @dataHora)`,
  ).run({
    fluxo: usoTokens.fluxo,
    modelo: usoTokens.modelo,
    tokensPrompt: usoTokens.tokensPrompt,
    tokensCompletion: usoTokens.tokensCompletion,
    custoEstimado: usoTokens.custoEstimado,
    origem: usoTokens.origem,
    dataHora: new Date().toISOString(),
  });
}
