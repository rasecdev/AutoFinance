import type { DbClient } from '../client.js';

export type NovaAnaliseQualidade = {
  periodo: string;
  conteudoGerado: string;
};

export function registrarAnaliseQualidade(db: DbClient, entrada: NovaAnaliseQualidade): void {
  db.prepare(
    `INSERT INTO analises_qualidade (periodo, conteudo_gerado, data_hora)
     VALUES (@periodo, @conteudoGerado, @dataHora)`,
  ).run({
    periodo: entrada.periodo,
    conteudoGerado: entrada.conteudoGerado,
    dataHora: new Date().toISOString(),
  });
}
