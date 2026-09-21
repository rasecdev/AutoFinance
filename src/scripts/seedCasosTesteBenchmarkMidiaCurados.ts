import { fileURLToPath } from 'node:url';
import writeXlsxFile from 'write-excel-file/node';
import { loadEnv } from '../config/env.js';
import { getDb, type DbClient } from '../db/client.js';
import { criarCasoTeste, listarCasosTeste } from '../db/repositories/casosTesteBenchmark.js';
import { createLogger } from '../logging/logger.js';
import { gerarPdfTexto } from './gerarPdfTeste.js';

const FLUXO_LEITURA_COMPROVANTE = 'leitura_comprovante';
const FLUXO_INTERPRETAR_PLANILHA = 'interpretar_planilha';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type CasoCuradoComprovante = {
  rotulo: string;
  linhas: string[];
  saidaEsperada: Record<string, unknown>;
};

// Fixture gerada em código (gerarPdfTexto), nunca um arquivo versionado —
// mesmo princípio do seed de texto (seedCasosTesteBenchmarkCurados.ts).
// "rotulo" vira a entrada legível do caso (mostrada em listagens), o PDF de
// verdade fica em entradaArquivo. saidaEsperada só lista os campos que o
// texto do PDF sintético realmente contém — leitura_comprovante compara só
// isso (ver baterComprovante, src/ai/benchmark.ts).
const CASOS_COMPROVANTE: CasoCuradoComprovante[] = [
  {
    rotulo: 'comprovante compra mercado',
    linhas: [
      'SUPERMERCADO CENTRAL',
      'CNPJ: 12.345.678/0001-90',
      'Data: 10/09/2026',
      'TOTAL: R$ 45,00',
      'Forma de pagamento: Cartao de Debito',
    ],
    saidaEsperada: { eComprovante: true, tipoDocumento: 'compra', valor: 45, categoriaSugerida: 'Mercado' },
  },
  {
    rotulo: 'fatura cartao Nubank',
    linhas: ['FATURA CARTAO DE CREDITO', 'Banco: Nubank', 'Vencimento: 15/10/2026', 'Valor total: R$ 850,00'],
    saidaEsperada: { eComprovante: true, tipoDocumento: 'fatura_cartao', valor: 850, identificador: 'Nubank' },
  },
];

type CasoCuradoPlanilha = {
  rotulo: string;
  linhas: string[][];
  saidaEsperada: Array<{ tipo: 'receita' | 'despesa'; valor: number; categoria: string; data: string }>;
};

// Mesmo princípio dos casos de comprovante acima: fixture gerada em código
// (write-excel-file, movida de devDependencies pra dependencies nesta
// tarefa já que passa a rodar em produção/Homologação via este seed, não só
// em teste), nunca um arquivo versionado. A linha de "TOTAL" no primeiro
// caso existe de propósito — testa que o modelo não inclui indevidamente
// linha de saldo/total como se fosse transação (regra explícita do prompt
// de interpretarPlanilha).
const CASOS_PLANILHA: CasoCuradoPlanilha[] = [
  {
    rotulo: 'planilha extrato com linha de total a ignorar',
    linhas: [
      ['Data', 'Histórico', 'Valor'],
      ['10/09/2026', 'Mercado Central', '-45,00'],
      ['05/09/2026', 'Salário', '1000,00'],
      ['', 'TOTAL', '955,00'],
    ],
    saidaEsperada: [
      { tipo: 'despesa', valor: 45, categoria: 'Mercado', data: '2026-09-10' },
      { tipo: 'receita', valor: 1000, categoria: 'Salário', data: '2026-09-05' },
    ],
  },
  {
    rotulo: 'planilha só com despesas',
    linhas: [
      ['Data', 'Descrição', 'Valor (R$)'],
      ['12/09/2026', 'Uber', '-30,00'],
      ['13/09/2026', 'Restaurante', '-80,00'],
    ],
    saidaEsperada: [
      { tipo: 'despesa', valor: 30, categoria: 'Transporte', data: '2026-09-12' },
      { tipo: 'despesa', valor: 80, categoria: 'Restaurante', data: '2026-09-13' },
    ],
  },
];

// Idempotente por rótulo (guardado como entrada) — rodar de novo no mesmo
// ambiente não duplica, mesmo padrão do seed de texto.
export async function seedCasosTesteBenchmarkMidiaCurados(db: DbClient): Promise<number> {
  let criados = 0;

  const comprovantesExistentes = new Set(
    listarCasosTeste(db, FLUXO_LEITURA_COMPROVANTE).map((caso) => caso.entrada),
  );
  for (const caso of CASOS_COMPROVANTE) {
    if (comprovantesExistentes.has(caso.rotulo)) continue;

    const pdf = gerarPdfTexto(caso.linhas);
    criarCasoTeste(db, {
      fluxo: FLUXO_LEITURA_COMPROVANTE,
      entrada: caso.rotulo,
      entradaArquivo: { base64: pdf.toString('base64'), mimeType: 'application/pdf' },
      saidaEsperada: caso.saidaEsperada,
      origem: 'curado',
    });
    criados += 1;
  }

  const planilhasExistentes = new Set(
    listarCasosTeste(db, FLUXO_INTERPRETAR_PLANILHA).map((caso) => caso.entrada),
  );
  for (const caso of CASOS_PLANILHA) {
    if (planilhasExistentes.has(caso.rotulo)) continue;

    const xlsx = await writeXlsxFile(caso.linhas).toBuffer();
    criarCasoTeste(db, {
      fluxo: FLUXO_INTERPRETAR_PLANILHA,
      entrada: caso.rotulo,
      entradaArquivo: { base64: xlsx.toString('base64'), mimeType: MIME_XLSX },
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

  const criados = await seedCasosTesteBenchmarkMidiaCurados(db);
  logger.info(
    { criados, total: CASOS_COMPROVANTE.length + CASOS_PLANILHA.length },
    'seed de casos de teste de mídia (leitura_comprovante/interpretar_planilha) concluído',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erro: unknown) => {
    console.error('falha ao rodar seed de casos de teste de mídia', erro);
    process.exitCode = 1;
  });
}
