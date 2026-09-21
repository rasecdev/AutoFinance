import type { DbClient } from '../client.js';

export type AlertaPrecoEnviado = {
  fluxo: string;
  tipo: string;
  modelo: string;
  preco: number;
};

export function jaFoiAlertado(db: DbClient, alerta: AlertaPrecoEnviado): boolean {
  const linha = db
    .prepare('SELECT 1 FROM alertas_preco_enviados WHERE fluxo = ? AND tipo = ? AND modelo = ? AND preco = ?')
    .get(alerta.fluxo, alerta.tipo, alerta.modelo, alerta.preco);

  return linha !== undefined;
}

export function registrarAlertaEnviado(db: DbClient, alerta: AlertaPrecoEnviado): void {
  db.prepare(
    `INSERT OR IGNORE INTO alertas_preco_enviados (fluxo, tipo, modelo, preco, criado_em)
     VALUES (@fluxo, @tipo, @modelo, @preco, @criadoEm)`,
  ).run({ ...alerta, criadoEm: new Date().toISOString() });
}
