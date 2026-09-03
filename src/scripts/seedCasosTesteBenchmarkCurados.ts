import { fileURLToPath } from 'node:url';
import { loadEnv } from '../config/env.js';
import { getDb, type DbClient } from '../db/client.js';
import { criarCasoTeste, listarCasosTeste, type NovoCasoTeste } from '../db/repositories/casosTesteBenchmark.js';
import { createLogger } from '../logging/logger.js';

const FLUXO_CONVERSA_TEXTO = 'conversa_texto';

// Conjunto fixo curado (tasks/plan.md, Fase Q) — não depende de curadoria
// orgânica via /certo. Contas/cartões são fictícios (ex: "Nubank") porque o
// motor de benchmark nunca executa o handler de verdade (só inspeciona
// tool_calls da resposta), então não precisam existir no banco.
// Cobre: básicas, as mais usadas (dado real de interacoes_ia em
// Homologação) e as de maior impacto financeiro (requerConfirmacao: true).
export const CASOS_CURADOS: Omit<NovoCasoTeste, 'fluxo' | 'origem'>[] = [
  { entrada: 'oi', saidaEsperada: [] },
  {
    entrada: 'qual meu saldo da conta Nubank?',
    saidaEsperada: [{ nome: 'consultar_saldo', argumentos: { conta_apelido: 'Nubank' } }],
  },
  {
    entrada: 'registra 50 reais de transporte na conta Nubank',
    saidaEsperada: [
      {
        nome: 'registrar_transacao',
        argumentos: { conta_apelido: 'Nubank', tipo: 'despesa', valor: 50, categoria: 'transporte' },
      },
    ],
  },
  {
    entrada: 'cria uma conta corrente no Nubank, PF, apelido Nubank',
    saidaEsperada: [{ nome: 'criar_conta', argumentos: { banco: 'Nubank', tipo: 'PF', apelido: 'Nubank' } }],
  },
  {
    entrada: 'me manda o relatório de hoje',
    saidaEsperada: [{ nome: 'relatorio', argumentos: { periodo: 'dia' } }],
  },
  {
    entrada: 'resumo do mês na conta Nubank',
    saidaEsperada: [{ nome: 'resumo_mensal', argumentos: { conta_apelido: 'Nubank' } }],
  },
  {
    entrada: 'quais dívidas eu tenho na conta Nubank?',
    saidaEsperada: [{ nome: 'consultar_dividas_ativas', argumentos: { conta_apelido: 'Nubank' } }],
  },
  {
    entrada: 'extrato da conta Nubank esse mês',
    saidaEsperada: [{ nome: 'consultar_extrato', argumentos: { conta_apelido: 'Nubank' } }],
  },
  {
    entrada: 'cria uma dívida de financiamento de 12000 reais em 24 parcelas na conta Nubank',
    saidaEsperada: [
      {
        nome: 'criar_divida',
        argumentos: { conta_apelido: 'Nubank', tipo: 'financiamento', valor_total: 12000, num_parcelas: 24 },
      },
    ],
  },
  {
    entrada: 'quita a dívida de financiamento da conta Nubank',
    saidaEsperada: [
      { nome: 'quitar_divida', argumentos: { conta_apelido: 'Nubank', tipo_divida: 'financiamento' } },
    ],
  },
  {
    entrada: 'amortiza 500 reais da dívida de financiamento da conta Nubank, reduzindo o valor das parcelas',
    saidaEsperada: [
      {
        nome: 'amortizar_divida',
        argumentos: { conta_apelido: 'Nubank', tipo_divida: 'financiamento', valor: 500, modo: 'reduzir_valor' },
      },
    ],
  },
  {
    entrada: 'renegocia a dívida de financiamento da conta Nubank pra 15000 em 30 parcelas',
    saidaEsperada: [
      {
        nome: 'renegociar',
        argumentos: {
          origem: 'divida',
          conta_apelido: 'Nubank',
          tipo_divida: 'financiamento',
          valor_total: 15000,
          num_parcelas: 30,
        },
      },
    ],
  },
  {
    entrada: 'exclui a última transação',
    saidaEsperada: [{ nome: 'excluir_transacao', argumentos: {} }],
  },
];

// Idempotente por entrada — rodar de novo no mesmo ambiente não duplica.
export function seedCasosTesteBenchmarkCurados(db: DbClient): number {
  const jaExistentes = new Set(listarCasosTeste(db, FLUXO_CONVERSA_TEXTO).map((caso) => caso.entrada));

  let criados = 0;
  for (const caso of CASOS_CURADOS) {
    if (jaExistentes.has(caso.entrada)) continue;

    criarCasoTeste(db, { ...caso, fluxo: FLUXO_CONVERSA_TEXTO, origem: 'curado' });
    criados += 1;
  }

  return criados;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(undefined, env.logLevel);
  const db = getDb(env);

  const criados = seedCasosTesteBenchmarkCurados(db);
  logger.info({ criados, total: CASOS_CURADOS.length }, 'seed de casos de teste curados concluído');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erro: unknown) => {
    console.error('falha ao rodar seed de casos de teste curados', erro);
    process.exitCode = 1;
  });
}
