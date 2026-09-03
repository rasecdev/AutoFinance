import type { DbClient } from '../client.js';

export type OrigemCasoTeste = 'curado' | 'derivado_correcao';

export type ToolCallEsperada = {
  nome: string;
  argumentos: unknown;
};

export type NovoCasoTeste = {
  fluxo: string;
  entrada: string;
  saidaEsperada: ToolCallEsperada[];
  origem: OrigemCasoTeste;
};

export type CasoTesteBenchmark = {
  id: number;
  fluxo: string;
  entrada: string;
  saidaEsperada: ToolCallEsperada[];
  origem: OrigemCasoTeste;
  criadoEm: string;
};

type LinhaCasoTeste = {
  id: number;
  fluxo: string;
  entrada: string;
  saida_esperada: string;
  origem: OrigemCasoTeste;
  criado_em: string;
};

function mapearLinha(linha: LinhaCasoTeste): CasoTesteBenchmark {
  return {
    id: linha.id,
    fluxo: linha.fluxo,
    entrada: linha.entrada,
    saidaEsperada: JSON.parse(linha.saida_esperada) as ToolCallEsperada[],
    origem: linha.origem,
    criadoEm: linha.criado_em,
  };
}

export function criarCasoTeste(db: DbClient, caso: NovoCasoTeste): CasoTesteBenchmark {
  const criadoEm = new Date().toISOString();

  const resultado = db
    .prepare(
      'INSERT INTO casos_teste_benchmark (fluxo, entrada, saida_esperada, origem, criado_em) VALUES (?, ?, ?, ?, ?)',
    )
    .run(caso.fluxo, caso.entrada, JSON.stringify(caso.saidaEsperada), caso.origem, criadoEm);

  return {
    id: Number(resultado.lastInsertRowid),
    fluxo: caso.fluxo,
    entrada: caso.entrada,
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
