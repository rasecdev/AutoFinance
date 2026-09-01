import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import {
  buscarDividasPorContaETipo,
  criarDivida,
  gerarValoresParcelas,
  marcarDividaRenegociada,
} from '../../src/db/repositories/dividas.js';
import { migrate } from '../../src/db/migrate.js';
import { criarConta } from '../../src/db/repositories/contas.js';

const CHAVE_TESTE = 'chave-teste-dividas';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-dividas-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Principal' }).id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('criarDivida', () => {
  it('grava a dívida e todas as parcelas numa única operação', () => {
    const { divida, parcelas } = criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 12000,
      numParcelas: 12,
      dataInicio: '2026-09-01',
    });

    expect(divida.id).toBeGreaterThan(0);
    expect(parcelas).toHaveLength(12);
    expect(parcelas.every((parcela) => parcela.dividaId === divida.id)).toBe(true);
  });

  it('usa indexador "fixo" como default quando omitido', () => {
    const { divida } = criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 1000,
      numParcelas: 2,
      dataInicio: '2026-09-01',
    });

    expect(divida.indexador).toBe('fixo');
    expect(divida.sistemaAmortizacao).toBeNull();
  });

  it('aceita campos opcionais ausentes sem erro', () => {
    expect(() =>
      criarDivida(db, {
        contaId,
        tipo: 'outro',
        valorTotal: 500,
        numParcelas: 1,
        dataInicio: '2026-09-01',
      }),
    ).not.toThrow();
  });

  it('calcula as datas de vencimento mensalmente a partir de data_inicio', () => {
    const { parcelas } = criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 300,
      numParcelas: 3,
      dataInicio: '2026-01-31',
    });

    expect(parcelas.map((parcela) => parcela.dataVencimento)).toEqual([
      '2026-03-03', // fev/2026 não tem dia 31 -> JS normaliza pra 3 de março
      '2026-03-31',
      '2026-05-01', // abr/2026 tem 30 dias -> normaliza pro dia 1 de maio
    ]);
  });

  it('parcela_pagas inicia em zero e status em ativo', () => {
    const { divida } = criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 1000,
      numParcelas: 4,
      dataInicio: '2026-09-01',
    });

    expect(divida.parcelasPagas).toBe(0);
    expect(divida.status).toBe('ativo');
  });

  it('grava descricao quando informada, null quando omitida', () => {
    const comDescricao = criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 1000,
      numParcelas: 2,
      dataInicio: '2026-09-01',
      descricao: 'Carro',
    }).divida;
    const semDescricao = criarDivida(db, {
      contaId,
      tipo: 'outro',
      valorTotal: 1000,
      numParcelas: 2,
      dataInicio: '2026-09-01',
    }).divida;

    expect(comDescricao.descricao).toBe('Carro');
    expect(semDescricao.descricao).toBeNull();
  });
});

describe('buscarDividasPorContaETipo', () => {
  it('não tem apelido próprio — retorna vazio quando não há dívida desse tipo na conta', () => {
    expect(buscarDividasPorContaETipo(db, contaId, 'financiamento')).toEqual([]);
  });

  it('retorna só as dívidas do tipo pedido, dentro da conta pedida', () => {
    criarDivida(db, { contaId, tipo: 'emprestimo', valorTotal: 1000, numParcelas: 2, dataInicio: '2026-09-01' });
    criarDivida(db, { contaId, tipo: 'financiamento', valorTotal: 2000, numParcelas: 2, dataInicio: '2026-09-01' });
    const outraContaId = criarConta(db, { bancoNome: 'Bradesco', tipo: 'PF', apelido: 'Outra' }).id;
    criarDivida(db, {
      contaId: outraContaId,
      tipo: 'emprestimo',
      valorTotal: 3000,
      numParcelas: 2,
      dataInicio: '2026-09-01',
    });

    const encontradas = buscarDividasPorContaETipo(db, contaId, 'emprestimo');

    expect(encontradas).toHaveLength(1);
    expect(encontradas[0]?.valorTotal).toBe(1000);
  });

  it('retorna mais de uma quando há duas dívidas do mesmo tipo na mesma conta', () => {
    criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 1000,
      numParcelas: 2,
      dataInicio: '2026-09-01',
      descricao: 'Carro',
    });
    criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 2000,
      numParcelas: 2,
      dataInicio: '2026-09-01',
      descricao: 'Reforma',
    });

    expect(buscarDividasPorContaETipo(db, contaId, 'emprestimo')).toHaveLength(2);
  });

  it('ignora dívida renegociada — não disputa ambiguidade com a nova dívida gerada pela renegociação', () => {
    const { divida: original } = criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 10000,
      numParcelas: 10,
      dataInicio: '2026-09-01',
    });
    marcarDividaRenegociada(db, original.id);
    criarDivida(db, { contaId, tipo: 'financiamento', valorTotal: 8000, numParcelas: 12, dataInicio: '2026-09-01' });

    const encontradas = buscarDividasPorContaETipo(db, contaId, 'financiamento');

    expect(encontradas).toHaveLength(1);
    expect(encontradas[0]?.valorTotal).toBe(8000);
  });
});

describe('gerarValoresParcelas', () => {
  it('sem sistema de amortização, divide o total igualmente', () => {
    const valores = gerarValoresParcelas(1000, 4, undefined, undefined);
    expect(valores).toEqual([250, 250, 250, 250]);
  });

  it('sistema price: parcelas de valor constante mesmo com juros', () => {
    const valores = gerarValoresParcelas(10000, 12, 0.02, 'price');
    expect(valores).toHaveLength(12);
    expect(new Set(valores.map((v) => v.toFixed(8))).size).toBe(1);
  });

  it('sistema sac: parcelas decrescentes, primeira maior que a última', () => {
    const valores = gerarValoresParcelas(10000, 12, 0.02, 'sac');
    expect(valores).toHaveLength(12);
    expect(valores[0]).toBeGreaterThan(valores[valores.length - 1] as number);
  });

  it('sac com taxa zero converge para o mesmo valor do price', () => {
    const price = gerarValoresParcelas(1200, 12, 0, 'price');
    const sac = gerarValoresParcelas(1200, 12, 0, 'sac');
    expect(sac).toEqual(price);
  });
});
