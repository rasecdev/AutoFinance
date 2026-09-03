import type { DbClient } from '../client.js';

export type NovoSnapshotModelo = {
  modelo: string;
  precoPrompt: number;
  precoCompletion: number;
  capacidades?: string[];
};

export type SnapshotModelo = {
  id: number;
  modelo: string;
  precoPrompt: number;
  precoCompletion: number;
  capacidades: string[] | null;
  dataSnapshot: string;
};

type LinhaSnapshotModelo = {
  id: number;
  modelo: string;
  preco_prompt: number;
  preco_completion: number;
  capacidades: string | null;
  data_snapshot: string;
};

function mapearLinha(linha: LinhaSnapshotModelo): SnapshotModelo {
  return {
    id: linha.id,
    modelo: linha.modelo,
    precoPrompt: linha.preco_prompt,
    precoCompletion: linha.preco_completion,
    capacidades: linha.capacidades ? (JSON.parse(linha.capacidades) as string[]) : null,
    dataSnapshot: linha.data_snapshot,
  };
}

export function registrarSnapshotModelo(db: DbClient, snapshot: NovoSnapshotModelo): void {
  db.prepare(
    `INSERT INTO modelos_openrouter_historico (modelo, preco_prompt, preco_completion, capacidades, data_snapshot)
     VALUES (@modelo, @precoPrompt, @precoCompletion, @capacidades, @dataSnapshot)`,
  ).run({
    modelo: snapshot.modelo,
    precoPrompt: snapshot.precoPrompt,
    precoCompletion: snapshot.precoCompletion,
    capacidades: snapshot.capacidades ? JSON.stringify(snapshot.capacidades) : null,
    dataSnapshot: new Date().toISOString(),
  });
}

export function registrarSnapshotCatalogo(db: DbClient, snapshots: NovoSnapshotModelo[]): void {
  const inserirTodos = db.transaction((linhas: NovoSnapshotModelo[]) => {
    for (const linha of linhas) {
      registrarSnapshotModelo(db, linha);
    }
  });
  inserirTodos(snapshots);
}

export function obterUltimosSnapshots(db: DbClient, modelo: string, limite: number): SnapshotModelo[] {
  const linhas = db
    .prepare('SELECT * FROM modelos_openrouter_historico WHERE modelo = ? ORDER BY id DESC LIMIT ?')
    .all(modelo, limite) as LinhaSnapshotModelo[];

  return linhas.map(mapearLinha);
}

// Custo estimado de uma chamada de IA, a partir do snapshot de preço mais
// recente do modelo usado — 0 quando ainda não existe snapshot pra esse
// modelo (mesma degradação graciosa já usada na Métrica 1 do relatório
// mensal/semanal), nunca lança erro por preço ausente.
export function calcularCustoTokens(
  db: DbClient,
  modelo: string,
  tokensPrompt: number,
  tokensCompletion: number,
): number {
  const [snapshotMaisRecente] = obterUltimosSnapshots(db, modelo, 1);
  if (!snapshotMaisRecente) return 0;

  return tokensPrompt * snapshotMaisRecente.precoPrompt + tokensCompletion * snapshotMaisRecente.precoCompletion;
}

// Usado pra buscar candidato mais barato no catálogo inteiro: o snapshot mais
// recente de cada modelo distinto (não só os já roteados).
export function obterUltimoSnapshotPorModelo(db: DbClient): SnapshotModelo[] {
  const linhas = db
    .prepare(
      `SELECT m.* FROM modelos_openrouter_historico m
       INNER JOIN (
         SELECT modelo, MAX(id) AS max_id FROM modelos_openrouter_historico GROUP BY modelo
       ) mais_recente ON m.modelo = mais_recente.modelo AND m.id = mais_recente.max_id`,
    )
    .all() as LinhaSnapshotModelo[];

  return linhas.map(mapearLinha);
}
