import type { DbClient } from '../client.js';

export type NovoBenchmark = {
  fluxo: string;
  modelIdOpenrouter: string;
  metrica: string;
  valor: number;
  fonteUrl: string;
};

export type BenchmarkModelo = {
  id: number;
  fluxo: string;
  modelIdOpenrouter: string;
  metrica: string;
  valor: number;
  fonteUrl: string;
  dataPesquisa: string;
};

type LinhaBenchmarkModelo = {
  id: number;
  fluxo: string;
  model_id_openrouter: string;
  metrica: string;
  valor: number;
  fonte_url: string;
  data_pesquisa: string;
};

function mapearLinha(linha: LinhaBenchmarkModelo): BenchmarkModelo {
  return {
    id: linha.id,
    fluxo: linha.fluxo,
    modelIdOpenrouter: linha.model_id_openrouter,
    metrica: linha.metrica,
    valor: linha.valor,
    fonteUrl: linha.fonte_url,
    dataPesquisa: linha.data_pesquisa,
  };
}

export function registrarBenchmark(db: DbClient, benchmark: NovoBenchmark): BenchmarkModelo {
  const dataPesquisa = new Date().toISOString();

  const resultado = db
    .prepare(
      'INSERT INTO benchmarks_modelos (fluxo, model_id_openrouter, metrica, valor, fonte_url, data_pesquisa) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(benchmark.fluxo, benchmark.modelIdOpenrouter, benchmark.metrica, benchmark.valor, benchmark.fonteUrl, dataPesquisa);

  return {
    id: Number(resultado.lastInsertRowid),
    fluxo: benchmark.fluxo,
    modelIdOpenrouter: benchmark.modelIdOpenrouter,
    metrica: benchmark.metrica,
    valor: benchmark.valor,
    fonteUrl: benchmark.fonteUrl,
    dataPesquisa,
  };
}

export function listarBenchmarks(db: DbClient, fluxo: string, modelIdOpenrouter: string): BenchmarkModelo[] {
  const linhas = db
    .prepare('SELECT * FROM benchmarks_modelos WHERE fluxo = ? AND model_id_openrouter = ? ORDER BY id DESC')
    .all(fluxo, modelIdOpenrouter) as LinhaBenchmarkModelo[];

  return linhas.map(mapearLinha);
}
