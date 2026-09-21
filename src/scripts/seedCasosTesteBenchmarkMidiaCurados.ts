import { fileURLToPath } from 'node:url';
import { loadEnv } from '../config/env.js';
import { getDb, type DbClient } from '../db/client.js';
import { criarCasoTeste, listarCasosTeste } from '../db/repositories/casosTesteBenchmark.js';
import { createLogger } from '../logging/logger.js';
import { gerarPdfTexto } from './gerarPdfTeste.js';

const FLUXO_LEITURA_COMPROVANTE = 'leitura_comprovante';

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

// Idempotente por rótulo (guardado como entrada) — rodar de novo no mesmo
// ambiente não duplica, mesmo padrão do seed de texto.
export function seedCasosTesteBenchmarkMidiaCurados(db: DbClient): number {
  const jaExistentes = new Set(listarCasosTeste(db, FLUXO_LEITURA_COMPROVANTE).map((caso) => caso.entrada));

  let criados = 0;
  for (const caso of CASOS_COMPROVANTE) {
    if (jaExistentes.has(caso.rotulo)) continue;

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

  return criados;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(undefined, env.logLevel);
  const db = getDb(env);

  const criados = seedCasosTesteBenchmarkMidiaCurados(db);
  logger.info(
    { criados, total: CASOS_COMPROVANTE.length },
    'seed de casos de teste de mídia (leitura_comprovante) concluído',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erro: unknown) => {
    console.error('falha ao rodar seed de casos de teste de mídia', erro);
    process.exitCode = 1;
  });
}
