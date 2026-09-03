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

export type UsoTokensRegistro = {
  id: number;
  fluxo: string;
  modelo: string;
  tokensPrompt: number;
  tokensCompletion: number;
  custoEstimado: number;
  origem: OrigemUsoTokens;
  dataHora: string;
};

type LinhaUsoTokens = {
  id: number;
  fluxo: string;
  modelo: string;
  tokens_prompt: number;
  tokens_completion: number;
  custo_estimado: number;
  origem: OrigemUsoTokens;
  data_hora: string;
};

function mapearLinha(linha: LinhaUsoTokens): UsoTokensRegistro {
  return {
    id: linha.id,
    fluxo: linha.fluxo,
    modelo: linha.modelo,
    tokensPrompt: linha.tokens_prompt,
    tokensCompletion: linha.tokens_completion,
    custoEstimado: linha.custo_estimado,
    origem: linha.origem,
    dataHora: linha.data_hora,
  };
}

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

export function listarUsoTokensPeriodo(
  db: DbClient,
  periodo: { inicio: string; fim: string },
): UsoTokensRegistro[] {
  const linhas = db
    .prepare('SELECT * FROM uso_tokens WHERE data_hora >= ? AND data_hora <= ? ORDER BY data_hora')
    .all(periodo.inicio, periodo.fim) as LinhaUsoTokens[];

  return linhas.map(mapearLinha);
}
