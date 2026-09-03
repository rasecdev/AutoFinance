import type { DbClient } from '../client.js';

export type ModeloReferenciaComparacao = {
  id: number;
  nomeExibicao: string;
  modelIdOpenrouter: string;
  ativo: boolean;
};

type LinhaModeloReferenciaComparacao = {
  id: number;
  nome_exibicao: string;
  model_id_openrouter: string;
  ativo: number;
};

function mapearLinha(linha: LinhaModeloReferenciaComparacao): ModeloReferenciaComparacao {
  return {
    id: linha.id,
    nomeExibicao: linha.nome_exibicao,
    modelIdOpenrouter: linha.model_id_openrouter,
    ativo: linha.ativo === 1,
  };
}

export function criarModeloReferencia(
  db: DbClient,
  nomeExibicao: string,
  modelIdOpenrouter: string,
): ModeloReferenciaComparacao {
  const resultado = db
    .prepare(
      'INSERT INTO modelos_referencia_comparacao (nome_exibicao, model_id_openrouter, ativo) VALUES (?, ?, 1)',
    )
    .run(nomeExibicao, modelIdOpenrouter);

  return {
    id: Number(resultado.lastInsertRowid),
    nomeExibicao,
    modelIdOpenrouter,
    ativo: true,
  };
}

export function listarModelosReferenciaAtivos(db: DbClient): ModeloReferenciaComparacao[] {
  const linhas = db
    .prepare('SELECT * FROM modelos_referencia_comparacao WHERE ativo = 1 ORDER BY id')
    .all() as LinhaModeloReferenciaComparacao[];

  return linhas.map(mapearLinha);
}
