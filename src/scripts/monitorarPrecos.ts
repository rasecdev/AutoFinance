import { fileURLToPath } from 'node:url';
import { loadEnv } from '../config/env.js';
import { getDb } from '../db/client.js';
import {
  registrarSnapshotCatalogo,
  type NovoSnapshotModelo,
} from '../db/repositories/modelosOpenrouterHistorico.js';
import { createLogger } from '../logging/logger.js';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

type ModeloOpenRouter = {
  id: string;
  pricing: { prompt: string; completion: string };
  supported_parameters?: string[];
};

type RespostaModelosOpenRouter = { data: ModeloOpenRouter[] };

// GET /api/v1/models é público (sem autenticação) — confirmado direto contra a API.
export async function buscarCatalogoOpenRouter(): Promise<ModeloOpenRouter[]> {
  const resposta = await fetch(OPENROUTER_MODELS_URL);

  if (!resposta.ok) {
    throw new Error(`OpenRouter GET /models respondeu ${resposta.status}`);
  }

  const corpo = (await resposta.json()) as RespostaModelosOpenRouter;
  return corpo.data;
}

export function paraSnapshots(modelos: ModeloOpenRouter[]): NovoSnapshotModelo[] {
  return modelos.map((modelo) => ({
    modelo: modelo.id,
    precoPrompt: Number(modelo.pricing.prompt),
    precoCompletion: Number(modelo.pricing.completion),
    capacidades: modelo.supported_parameters,
  }));
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(undefined, env.logLevel);
  const db = getDb(env);

  const modelos = await buscarCatalogoOpenRouter();
  registrarSnapshotCatalogo(db, paraSnapshots(modelos));

  logger.info({ total: modelos.length }, 'snapshot de preços do OpenRouter gravado');
}

// Guard pra rodar main() só quando o arquivo é executado diretamente (node
// dist/scripts/monitorarPrecos.js), não quando importado por teste — sem
// isso, importar este módulo pra testar buscarCatalogoOpenRouter/paraSnapshots
// dispararia loadEnv()/getDb() reais no processo de teste.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erro: unknown) => {
    console.error('falha ao gerar snapshot de preços do OpenRouter', erro);
    process.exitCode = 1;
  });
}
