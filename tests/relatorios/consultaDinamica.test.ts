import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { criarTransacao } from '../../src/db/repositories/transacoes.js';
import { migrate } from '../../src/db/migrate.js';
import {
  ParametroConsultaInvalidoError,
  executarConsultaDinamica,
} from '../../src/relatorios/consultaDinamica.js';

const CHAVE_TESTE = 'chave-teste-consulta-dinamica';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-consulta-dinamica-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal', saldoInicial: 1000 }).id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('executarConsultaDinamica — domínio financeiro', () => {
  it('agrupa por 1 dimensão (categoria) e ordena por valor decrescente com limite', () => {
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 100, categoria: 'Mercado', data: '2026-09-01' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 50, categoria: 'Mercado', data: '2026-09-05' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 300, categoria: 'Transporte', data: '2026-09-02' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 10, categoria: 'Lazer', data: '2026-09-03' });

    const resultado = executarConsultaDinamica(db, {
      dominio: 'financeiro',
      metrica: 'soma_valor',
      agruparPor: ['categoria'],
      ordenarPor: 'desc',
      limite: 2,
    });

    expect(resultado.linhas).toEqual([
      { rotulo: 'Transporte', valor: 300 },
      { rotulo: 'Mercado', valor: 150 },
    ]);
  });

  it('calcula soma_valor, media_valor, contagem e saldo corretamente', () => {
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 100, categoria: 'Mercado', data: '2026-09-01' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 50, categoria: 'Mercado', data: '2026-09-05' });
    criarTransacao(db, { contaId, tipo: 'receita', valor: 500, categoria: 'Salário', data: '2026-09-06' });

    const soma = executarConsultaDinamica(db, {
      dominio: 'financeiro',
      metrica: 'soma_valor',
      agruparPor: ['categoria'],
      filtros: { categoria: 'Mercado' },
    });
    expect(soma.linhas).toEqual([{ rotulo: 'Mercado', valor: 150 }]);

    const media = executarConsultaDinamica(db, {
      dominio: 'financeiro',
      metrica: 'media_valor',
      agruparPor: ['categoria'],
      filtros: { categoria: 'Mercado' },
    });
    expect(media.linhas).toEqual([{ rotulo: 'Mercado', valor: 75 }]);

    const contagem = executarConsultaDinamica(db, {
      dominio: 'financeiro',
      metrica: 'contagem',
      agruparPor: ['categoria'],
      filtros: { categoria: 'Mercado' },
    });
    expect(contagem.linhas).toEqual([{ rotulo: 'Mercado', valor: 2 }]);

    const saldo = executarConsultaDinamica(db, {
      dominio: 'financeiro',
      metrica: 'saldo',
      agruparPor: ['tipo_transacao'],
    });
    expect(saldo.linhas).toEqual(
      expect.arrayContaining([
        { rotulo: 'despesa', valor: -150 },
        { rotulo: 'receita', valor: 500 },
      ]),
    );
  });

  it('agrupa por 2 dimensões (categoria, mes) devolvendo serie/rotulo/valor, mes sempre cronológico', () => {
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 100, categoria: 'Mercado', data: '2026-07-01' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 200, categoria: 'Mercado', data: '2026-09-01' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 50, categoria: 'Mercado', data: '2026-08-01' });

    const resultado = executarConsultaDinamica(db, {
      dominio: 'financeiro',
      metrica: 'soma_valor',
      agruparPor: ['categoria', 'mes'],
      ordenarPor: 'asc',
    });

    expect(resultado.linhas).toEqual([
      { serie: 'Mercado', rotulo: 'jul/26', valor: 100 },
      { serie: 'Mercado', rotulo: 'ago/26', valor: 50 },
      { serie: 'Mercado', rotulo: 'set/26', valor: 200 },
    ]);
  });

  it('mes ignora ordenar_por como critério, só usa como direção (desc = mais recente primeiro)', () => {
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 999, categoria: 'Mercado', data: '2026-07-01' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 1, categoria: 'Mercado', data: '2026-09-01' });

    const resultado = executarConsultaDinamica(db, {
      dominio: 'financeiro',
      metrica: 'soma_valor',
      agruparPor: ['mes'],
      ordenarPor: 'desc',
    });

    expect(resultado.linhas).toEqual([
      { rotulo: 'set/26', valor: 1 },
      { rotulo: 'jul/26', valor: 999 },
    ]);
  });

  it('filtros de data/conta/cartão/tipo combinam com o agrupamento', () => {
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 100, categoria: 'Mercado', data: '2026-09-01' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 200, categoria: 'Mercado', data: '2026-10-01' });

    const resultado = executarConsultaDinamica(db, {
      dominio: 'financeiro',
      metrica: 'soma_valor',
      agruparPor: ['categoria'],
      filtros: { dataInicio: '2026-09-01', dataFim: '2026-09-30', contaId },
    });

    expect(resultado.linhas).toEqual([{ rotulo: 'Mercado', valor: 100 }]);
  });

  it('dimensão fora da whitelist lança ParametroConsultaInvalidoError', () => {
    expect(() =>
      executarConsultaDinamica(db, {
        dominio: 'financeiro',
        metrica: 'soma_valor',
        // @ts-expect-error dimensão inválida de propósito
        agruparPor: ['inexistente'],
      }),
    ).toThrow(ParametroConsultaInvalidoError);
  });

  it('mais de 2 dimensões em agrupar_por lança ParametroConsultaInvalidoError', () => {
    expect(() =>
      executarConsultaDinamica(db, {
        dominio: 'financeiro',
        metrica: 'soma_valor',
        agruparPor: ['categoria', 'mes', 'conta_id'],
      }),
    ).toThrow(ParametroConsultaInvalidoError);
  });
});
