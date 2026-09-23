import { fileURLToPath } from 'node:url';
import { loadEnv } from '../config/env.js';
import type { DadosParaAnaliseQualidade } from '../ai/analisarQualidade.js';
import type { FatosEsperadosAnaliseQualidade, FatosEsperadosRelatorioMensal } from '../ai/benchmark.js';
import type { DadosParaResumoMensal } from '../ai/relatorioMensal.js';
import { getDb, type DbClient } from '../db/client.js';
import { criarCasoTeste, listarCasosTeste } from '../db/repositories/casosTesteBenchmark.js';
import { createLogger } from '../logging/logger.js';

const FLUXO_RELATORIO_MENSAL = 'relatorio_mensal';
const FLUXO_ANALISAR_QUALIDADE = 'analisar_qualidade';

// relatorio_mensal/analisar_qualidade geram prosa livre — o "gabarito" aqui
// não é o texto em si, é o dado estruturado de entrada (mesmo JSON que o
// fluxo real recebe) mais os fatos-chave que ele deveria narrar certo
// (baterFatosRelatorioMensal/baterFatosAnaliseQualidade, em ../ai/benchmark.ts).
// "entrada" guarda o JSON serializado (sem arquivo binário envolvido, ao
// contrário dos casos de mídia) — mesmo princípio dos outros seeds: fixture
// gerada em código, nunca um caso real de usuário versionado.
type CasoCuradoRelatorioMensal = {
  rotulo: string;
  dados: DadosParaResumoMensal;
  saidaEsperada: FatosEsperadosRelatorioMensal;
};

const CASOS_RELATORIO_MENSAL: CasoCuradoRelatorioMensal[] = [
  {
    rotulo: 'relatorio mensal saldo positivo, custo de IA subiu',
    dados: {
      inicio: '2026-09-01',
      fim: '2026-09-30',
      financeiro: {
        totalReceita: 3000,
        totalDespesa: 800,
        porCategoria: [
          { categoria: 'Mercado', totalReceita: 0, totalDespesa: 500 },
          { categoria: 'Transporte', totalReceita: 0, totalDespesa: 300 },
        ],
        porConta: [{ apelido: 'Nubank', totalReceita: 3000, totalDespesa: 800, saldoAtual: 2200 }],
        saldoConsolidado: 2200,
      },
      usoIa: {
        porFluxoModelo: [
          { fluxo: 'conversa_texto', modelo: 'openai/gpt-4o-mini', tokensPrompt: 5000, tokensCompletion: 800, custoEstimado: 0.5 },
        ],
        totalTokensPrompt: 5000,
        totalTokensCompletion: 800,
        totalCustoEstimado: 0.5,
        interacoesIncorretas: 1,
        metrica1: [],
        metrica2: [],
        metrica3: [],
      },
      financeiroAnterior: {
        totalReceita: 3000,
        totalDespesa: 900,
        porCategoria: [{ categoria: 'Mercado', totalReceita: 0, totalDespesa: 600 }],
        porConta: [{ apelido: 'Nubank', totalReceita: 3000, totalDespesa: 900, saldoAtual: 2100 }],
        saldoConsolidado: 2100,
      },
      usoIaAnterior: {
        porFluxoModelo: [
          { fluxo: 'conversa_texto', modelo: 'openai/gpt-4o-mini', tokensPrompt: 3000, tokensCompletion: 500, custoEstimado: 0.2 },
        ],
        totalTokensPrompt: 3000,
        totalTokensCompletion: 500,
        totalCustoEstimado: 0.2,
        interacoesIncorretas: 0,
        metrica1: [],
        metrica2: [],
        metrica3: [],
      },
    },
    saidaEsperada: { categoriaMaiorGasto: 'Mercado', saldoPositivo: true, custoIaSubiu: true },
  },
  {
    rotulo: 'relatorio mensal saldo negativo, custo de IA caiu',
    dados: {
      inicio: '2026-08-01',
      fim: '2026-08-31',
      financeiro: {
        totalReceita: 1000,
        totalDespesa: 1400,
        porCategoria: [
          { categoria: 'Transporte', totalReceita: 0, totalDespesa: 900 },
          { categoria: 'Lazer', totalReceita: 0, totalDespesa: 500 },
        ],
        porConta: [{ apelido: 'Nubank', totalReceita: 1000, totalDespesa: 1400, saldoAtual: -400 }],
        saldoConsolidado: -400,
      },
      usoIa: {
        porFluxoModelo: [
          { fluxo: 'conversa_texto', modelo: 'openai/gpt-4o-mini', tokensPrompt: 2000, tokensCompletion: 300, custoEstimado: 0.1 },
        ],
        totalTokensPrompt: 2000,
        totalTokensCompletion: 300,
        totalCustoEstimado: 0.1,
        interacoesIncorretas: 0,
        metrica1: [],
        metrica2: [],
        metrica3: [],
      },
      financeiroAnterior: {
        totalReceita: 1000,
        totalDespesa: 1100,
        porCategoria: [{ categoria: 'Transporte', totalReceita: 0, totalDespesa: 700 }],
        porConta: [{ apelido: 'Nubank', totalReceita: 1000, totalDespesa: 1100, saldoAtual: -100 }],
        saldoConsolidado: -100,
      },
      usoIaAnterior: {
        porFluxoModelo: [
          { fluxo: 'conversa_texto', modelo: 'openai/gpt-4o-mini', tokensPrompt: 6000, tokensCompletion: 900, custoEstimado: 0.6 },
        ],
        totalTokensPrompt: 6000,
        totalTokensCompletion: 900,
        totalCustoEstimado: 0.6,
        interacoesIncorretas: 2,
        metrica1: [],
        metrica2: [],
        metrica3: [],
      },
    },
    saidaEsperada: { categoriaMaiorGasto: 'Transporte', saldoPositivo: false, custoIaSubiu: false },
  },
];

type CasoCuradoAnaliseQualidade = {
  rotulo: string;
  dados: DadosParaAnaliseQualidade;
  saidaEsperada: FatosEsperadosAnaliseQualidade;
};

const CASOS_ANALISE_QUALIDADE: CasoCuradoAnaliseQualidade[] = [
  {
    rotulo: 'analise qualidade conversa_texto piorou',
    dados: {
      inicio: '2026-09-01',
      fim: '2026-09-30',
      atual: {
        porFluxoModelo: [
          { fluxo: 'conversa_texto', modelo: 'openai/gpt-4o-mini', total: 20, incorretas: 8 },
          { fluxo: 'leitura_comprovante', modelo: 'google/gemini-2.5-flash', total: 15, incorretas: 1 },
        ],
        erroPorContexto: [{ contexto: 'openrouter_timeout', total: 2 }],
        totalInteracoes: 35,
        totalIncorretas: 9,
        totalErrosTecnicos: 2,
      },
      anterior: {
        porFluxoModelo: [
          { fluxo: 'conversa_texto', modelo: 'openai/gpt-4o-mini', total: 20, incorretas: 2 },
          { fluxo: 'leitura_comprovante', modelo: 'google/gemini-2.5-flash', total: 15, incorretas: 1 },
        ],
        erroPorContexto: [],
        totalInteracoes: 35,
        totalIncorretas: 3,
        totalErrosTecnicos: 0,
      },
    },
    saidaEsperada: { entidadeDestaque: 'conversa_texto', situacaoPiorou: true },
  },
  {
    rotulo: 'analise qualidade leitura_comprovante melhorou',
    dados: {
      inicio: '2026-08-01',
      fim: '2026-08-31',
      atual: {
        porFluxoModelo: [
          { fluxo: 'conversa_texto', modelo: 'openai/gpt-4o-mini', total: 20, incorretas: 1 },
          { fluxo: 'leitura_comprovante', modelo: 'google/gemini-2.5-flash', total: 15, incorretas: 1 },
        ],
        erroPorContexto: [],
        totalInteracoes: 35,
        totalIncorretas: 2,
        totalErrosTecnicos: 0,
      },
      anterior: {
        porFluxoModelo: [
          { fluxo: 'conversa_texto', modelo: 'openai/gpt-4o-mini', total: 20, incorretas: 1 },
          { fluxo: 'leitura_comprovante', modelo: 'google/gemini-2.5-flash', total: 15, incorretas: 7 },
        ],
        erroPorContexto: [{ contexto: 'openrouter_timeout', total: 3 }],
        totalInteracoes: 35,
        totalIncorretas: 8,
        totalErrosTecnicos: 3,
      },
    },
    saidaEsperada: { entidadeDestaque: 'leitura_comprovante', situacaoPiorou: false },
  },
];

// Idempotente por rótulo (guardado como entrada) — mesmo princípio dos
// outros seeds de benchmark.
export function seedCasosTesteBenchmarkAnaliseCurados(db: DbClient): number {
  let criados = 0;

  const relatoriosExistentes = new Set(listarCasosTeste(db, FLUXO_RELATORIO_MENSAL).map((caso) => caso.entrada));
  for (const caso of CASOS_RELATORIO_MENSAL) {
    const entrada = JSON.stringify(caso.dados);
    if (relatoriosExistentes.has(entrada)) continue;

    criarCasoTeste(db, {
      fluxo: FLUXO_RELATORIO_MENSAL,
      entrada,
      saidaEsperada: caso.saidaEsperada,
      origem: 'curado',
    });
    criados += 1;
  }

  const analisesExistentes = new Set(listarCasosTeste(db, FLUXO_ANALISAR_QUALIDADE).map((caso) => caso.entrada));
  for (const caso of CASOS_ANALISE_QUALIDADE) {
    const entrada = JSON.stringify(caso.dados);
    if (analisesExistentes.has(entrada)) continue;

    criarCasoTeste(db, {
      fluxo: FLUXO_ANALISAR_QUALIDADE,
      entrada,
      saidaEsperada: caso.saidaEsperada,
      origem: 'curado',
    });
    criados += 1;
  }

  return criados;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(undefined, env.logLevel);
  const db = getDb(env);

  const criados = seedCasosTesteBenchmarkAnaliseCurados(db);
  logger.info(
    { criados, total: CASOS_RELATORIO_MENSAL.length + CASOS_ANALISE_QUALIDADE.length },
    'seed de casos de teste de relatorio_mensal/analisar_qualidade concluído',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erro: unknown) => {
    console.error('falha ao rodar seed de casos de teste de relatorio_mensal/analisar_qualidade', erro);
    process.exitCode = 1;
  });
}
