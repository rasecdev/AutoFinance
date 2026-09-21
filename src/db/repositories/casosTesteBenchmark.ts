import type { DbClient } from '../client.js';

export type OrigemCasoTeste = 'curado' | 'derivado_correcao';

// Mantido só como referência de tipo pro gabarito de tool-calling
// (conversa_texto) — saidaEsperada, na struct abaixo, é `unknown` porque cada
// fluxo (Fase 6 parte 14) guarda um formato de gabarito diferente (tool_calls
// pra conversa_texto, campos extraídos pra leitura_comprovante/interpretar_planilha,
// texto esperado pra transcricao_voz); quem sabe o formato certo é o
// consumidor (src/ai/benchmark.ts), não este repositório.
export type ToolCallEsperada = {
  nome: string;
  argumentos: unknown;
};

// Arquivo de entrada dos casos de fluxo de mídia (Fase 6 parte 14) — ausente
// pra casos de texto (conversa_texto). Fixtures são geradas em código no seed
// (nunca um arquivo versionado), pequenas o suficiente pra caber em base64
// numa coluna TEXT sem problema.
export type ArquivoCasoTeste = {
  base64: string;
  mimeType: string;
};

export type NovoCasoTeste = {
  fluxo: string;
  entrada: string;
  entradaArquivo?: ArquivoCasoTeste;
  saidaEsperada: unknown;
  origem: OrigemCasoTeste;
};

export type CasoTesteBenchmark = {
  id: number;
  fluxo: string;
  entrada: string;
  entradaArquivo?: ArquivoCasoTeste;
  saidaEsperada: unknown;
  origem: OrigemCasoTeste;
  criadoEm: string;
};

type LinhaCasoTeste = {
  id: number;
  fluxo: string;
  entrada: string;
  entrada_arquivo_base64: string | null;
  entrada_mime_type: string | null;
  saida_esperada: string;
  origem: OrigemCasoTeste;
  criado_em: string;
};

function mapearLinha(linha: LinhaCasoTeste): CasoTesteBenchmark {
  return {
    id: linha.id,
    fluxo: linha.fluxo,
    entrada: linha.entrada,
    entradaArquivo:
      linha.entrada_arquivo_base64 !== null && linha.entrada_mime_type !== null
        ? { base64: linha.entrada_arquivo_base64, mimeType: linha.entrada_mime_type }
        : undefined,
    saidaEsperada: JSON.parse(linha.saida_esperada) as unknown,
    origem: linha.origem,
    criadoEm: linha.criado_em,
  };
}

export function criarCasoTeste(db: DbClient, caso: NovoCasoTeste): CasoTesteBenchmark {
  const criadoEm = new Date().toISOString();

  const resultado = db
    .prepare(
      `INSERT INTO casos_teste_benchmark
        (fluxo, entrada, entrada_arquivo_base64, entrada_mime_type, saida_esperada, origem, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      caso.fluxo,
      caso.entrada,
      caso.entradaArquivo?.base64 ?? null,
      caso.entradaArquivo?.mimeType ?? null,
      JSON.stringify(caso.saidaEsperada),
      caso.origem,
      criadoEm,
    );

  return {
    id: Number(resultado.lastInsertRowid),
    fluxo: caso.fluxo,
    entrada: caso.entrada,
    entradaArquivo: caso.entradaArquivo,
    saidaEsperada: caso.saidaEsperada,
    origem: caso.origem,
    criadoEm,
  };
}

export function listarCasosTeste(db: DbClient, fluxo: string): CasoTesteBenchmark[] {
  const linhas = db
    .prepare('SELECT * FROM casos_teste_benchmark WHERE fluxo = ? ORDER BY id')
    .all(fluxo) as LinhaCasoTeste[];

  return linhas.map(mapearLinha);
}
