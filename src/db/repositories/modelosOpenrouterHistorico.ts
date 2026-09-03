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
