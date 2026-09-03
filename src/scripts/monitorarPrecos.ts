import { fileURLToPath } from 'node:url';
import { Bot } from 'grammy';
import { loadEnv } from '../config/env.js';
import { getDb, type DbClient } from '../db/client.js';
import {
  obterUltimoSnapshotPorModelo,
  obterUltimosSnapshots,
  registrarSnapshotCatalogo,
  type NovoSnapshotModelo,
  type SnapshotModelo,
} from '../db/repositories/modelosOpenrouterHistorico.js';
import { listarRoteamentos } from '../db/repositories/roteamentoTarefas.js';
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

export type OportunidadePreco =
  | { tipo: 'preco_mudou'; fluxo: string; modelo: string; precoAntigo: number; precoNovo: number }
  | {
      tipo: 'modelo_mais_barato';
      fluxo: string;
      modeloAtual: string;
      precoAtual: number;
      modeloCandidato: string;
      precoCandidato: number;
    };

function custoTotal(snapshot: SnapshotModelo): number {
  return snapshot.precoPrompt + snapshot.precoCompletion;
}

function atendeRequisitos(snapshot: SnapshotModelo, requisitos: string[]): boolean {
  return requisitos.every((requisito) => snapshot.capacidades?.includes(requisito) ?? false);
}

// Nunca troca modelo sozinho — só detecta e devolve, quem decide é o alerta lido por você.
export function detectarOportunidades(db: DbClient): OportunidadePreco[] {
  const oportunidades: OportunidadePreco[] = [];
  const catalogoAtual = obterUltimoSnapshotPorModelo(db);

  for (const roteamento of listarRoteamentos(db)) {
    const [atual, anterior] = obterUltimosSnapshots(db, roteamento.modeloPreferido, 2);
    if (!atual) continue;

    if (anterior && (atual.precoPrompt !== anterior.precoPrompt || atual.precoCompletion !== anterior.precoCompletion)) {
      oportunidades.push({
        tipo: 'preco_mudou',
        fluxo: roteamento.fluxo,
        modelo: roteamento.modeloPreferido,
        precoAntigo: custoTotal(anterior),
        precoNovo: custoTotal(atual),
      });
    }

    if (!roteamento.requisitos) continue;

    const requisitosLista = roteamento.requisitos
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
    if (requisitosLista.length === 0) continue;

    const precoAtual = custoTotal(atual);
    const candidato = catalogoAtual
      .filter((m) => m.modelo !== roteamento.modeloPreferido)
      .filter((m) => atendeRequisitos(m, requisitosLista))
      .filter((m) => custoTotal(m) < precoAtual)
      .sort((a, b) => custoTotal(a) - custoTotal(b))[0];

    if (candidato) {
      oportunidades.push({
        tipo: 'modelo_mais_barato',
        fluxo: roteamento.fluxo,
        modeloAtual: roteamento.modeloPreferido,
        precoAtual,
        modeloCandidato: candidato.modelo,
        precoCandidato: custoTotal(candidato),
      });
    }
  }

  return oportunidades;
}

export function formatarMensagemAlerta(oportunidades: OportunidadePreco[]): string {
  const linhas = oportunidades.map((oportunidade) => {
    if (oportunidade.tipo === 'preco_mudou') {
      return `💰 Preço mudou — fluxo "${oportunidade.fluxo}" (${oportunidade.modelo}): ${oportunidade.precoAntigo} → ${oportunidade.precoNovo} (USD por token, prompt+completion)`;
    }
    return `🔎 Modelo mais barato disponível — fluxo "${oportunidade.fluxo}": "${oportunidade.modeloCandidato}" (${oportunidade.precoCandidato}) atende os requisitos e é mais barato que o atual "${oportunidade.modeloAtual}" (${oportunidade.precoAtual})`;
  });

  return `Alerta de preço de modelos (OpenRouter):\n\n${linhas.join('\n')}\n\nNenhuma troca foi feita automaticamente — ajuste roteamento_tarefas manualmente se quiser.`;
}

export async function enviarAlertas(botToken: string, chatIds: string[], texto: string): Promise<void> {
  const bot = new Bot(botToken);
  for (const chatId of chatIds) {
    await bot.api.sendMessage(chatId, texto);
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(undefined, env.logLevel);
  const db = getDb(env);

  const modelos = await buscarCatalogoOpenRouter();
  registrarSnapshotCatalogo(db, paraSnapshots(modelos));
  logger.info({ total: modelos.length }, 'snapshot de preços do OpenRouter gravado');

  const oportunidades = detectarOportunidades(db);
  if (oportunidades.length > 0) {
    await enviarAlertas(env.telegramBotToken, env.telegramAllowedChatIds, formatarMensagemAlerta(oportunidades));
    logger.info({ total: oportunidades.length }, 'alerta de preço enviado');
  }
}

// Guard pra rodar main() só quando o arquivo é executado diretamente (node
// dist/scripts/monitorarPrecos.js), não quando importado por teste — sem
// isso, importar este módulo pra testar as funções puras dispararia
// loadEnv()/getDb() reais no processo de teste.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erro: unknown) => {
    console.error('falha ao gerar snapshot de preços do OpenRouter', erro);
    process.exitCode = 1;
  });
}
