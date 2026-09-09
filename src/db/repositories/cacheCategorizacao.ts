import type { DbClient } from '../client.js';

export type Origem = 'ia' | 'usuario';

export type NovaCategoriaCache = {
  descricaoNormalizada: string;
  categoria: string;
  origem: Origem;
  modeloSugeriu?: string | null;
};

export type CategoriaCache = {
  id: number;
  descricaoNormalizada: string;
  categoria: string;
  origem: Origem;
  modeloSugeriu: string | null;
  atualizadoEm: string;
};

type LinhaCategoriaCache = {
  id: number;
  descricao_normalizada: string;
  categoria: string;
  origem: Origem;
  modelo_sugeriu: string | null;
  atualizado_em: string;
};

function mapearLinha(linha: LinhaCategoriaCache): CategoriaCache {
  return {
    id: linha.id,
    descricaoNormalizada: linha.descricao_normalizada,
    categoria: linha.categoria,
    origem: linha.origem,
    modeloSugeriu: linha.modelo_sugeriu,
    atualizadoEm: linha.atualizado_em,
  };
}

export function buscarCategoriaCache(db: DbClient, descricaoNormalizada: string): CategoriaCache | undefined {
  const linha = db
    .prepare('SELECT * FROM cache_categorizacao WHERE descricao_normalizada = ?')
    .get(descricaoNormalizada) as LinhaCategoriaCache | undefined;

  return linha ? mapearLinha(linha) : undefined;
}

export function upsertCategoriaCache(db: DbClient, entrada: NovaCategoriaCache): void {
  db.prepare(
    `INSERT INTO cache_categorizacao (descricao_normalizada, categoria, origem, modelo_sugeriu, atualizado_em)
     VALUES (@descricaoNormalizada, @categoria, @origem, @modeloSugeriu, @atualizadoEm)
     ON CONFLICT(descricao_normalizada) DO UPDATE SET
       categoria = excluded.categoria,
       origem = excluded.origem,
       modelo_sugeriu = excluded.modelo_sugeriu,
       atualizado_em = excluded.atualizado_em`,
  ).run({
    descricaoNormalizada: entrada.descricaoNormalizada,
    categoria: entrada.categoria,
    origem: entrada.origem,
    modeloSugeriu: entrada.modeloSugeriu ?? null,
    atualizadoEm: new Date().toISOString(),
  });
}
