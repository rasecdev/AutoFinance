import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { criarDivida, incrementarParcelasPagas, obterDivida } from '../../src/db/repositories/dividas.js';
import { migrate } from '../../src/db/migrate.js';
import {
  cancelarParcela,
  listarParcelasPendentes,
  marcarParcelaPaga,
  obterParcelaPorNumero,
  obterProximaParcelaPendente,
} from '../../src/db/repositories/parcelas.js';

const CHAVE_TESTE = 'chave-teste-parcelas';

let dir: string;
let db: DbClient;
let contaId: number;
let dividaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-parcelas-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Principal' }).id;
  dividaId = criarDivida(db, {
    contaId,
    tipo: 'emprestimo',
    valorTotal: 1200,
    numParcelas: 4,
    dataInicio: '2026-09-01',
  }).divida.id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('obterParcelaPorNumero', () => {
  it('retorna a parcela pelo número dentro da dívida', () => {
    const parcela = obterParcelaPorNumero(db, dividaId, 2);
    expect(parcela?.numeroParcela).toBe(2);
    expect(parcela?.status).toBe('pendente');
  });

  it('retorna undefined quando não existe parcela com esse número', () => {
    expect(obterParcelaPorNumero(db, dividaId, 99)).toBeUndefined();
  });
});

describe('obterProximaParcelaPendente', () => {
  it('retorna a parcela pendente mais antiga', () => {
    expect(obterProximaParcelaPendente(db, dividaId)?.numeroParcela).toBe(1);
  });

  it('pula parcelas já pagas', () => {
    const parcela1 = obterParcelaPorNumero(db, dividaId, 1);
    if (parcela1) marcarParcelaPaga(db, parcela1.id, '2026-10-01');

    expect(obterProximaParcelaPendente(db, dividaId)?.numeroParcela).toBe(2);
  });

  it('retorna undefined quando todas as parcelas já foram pagas', () => {
    for (let n = 1; n <= 4; n++) {
      const parcela = obterParcelaPorNumero(db, dividaId, n);
      if (parcela) marcarParcelaPaga(db, parcela.id, '2026-10-01');
    }

    expect(obterProximaParcelaPendente(db, dividaId)).toBeUndefined();
  });
});

describe('marcarParcelaPaga', () => {
  it('atualiza status e data_pagamento', () => {
    const parcela = obterParcelaPorNumero(db, dividaId, 1);
    if (!parcela) throw new Error('parcela não encontrada no setup do teste');

    marcarParcelaPaga(db, parcela.id, '2026-10-05');

    const atualizada = obterParcelaPorNumero(db, dividaId, 1);
    expect(atualizada?.status).toBe('paga');
    expect(atualizada?.dataPagamento).toBe('2026-10-05');
  });
});

describe('listarParcelasPendentes', () => {
  it('retorna todas as parcelas quando nenhuma foi paga', () => {
    expect(listarParcelasPendentes(db, dividaId)).toHaveLength(4);
  });

  it('exclui parcelas já pagas', () => {
    const parcela1 = obterParcelaPorNumero(db, dividaId, 1);
    if (parcela1) marcarParcelaPaga(db, parcela1.id, '2026-10-01');

    const pendentes = listarParcelasPendentes(db, dividaId);

    expect(pendentes).toHaveLength(3);
    expect(pendentes.map((p) => p.numeroParcela)).toEqual([2, 3, 4]);
  });

  it('retorna vazio quando todas já foram pagas', () => {
    for (let n = 1; n <= 4; n++) {
      const parcela = obterParcelaPorNumero(db, dividaId, n);
      if (parcela) marcarParcelaPaga(db, parcela.id, '2026-10-01');
    }

    expect(listarParcelasPendentes(db, dividaId)).toEqual([]);
  });
});

describe('cancelarParcela', () => {
  it('marca a parcela como cancelada, nunca DELETE', () => {
    const parcela = obterParcelaPorNumero(db, dividaId, 4);
    if (!parcela) throw new Error('parcela não encontrada no setup do teste');

    cancelarParcela(db, parcela.id);

    const atualizada = obterParcelaPorNumero(db, dividaId, 4);
    expect(atualizada?.status).toBe('cancelada');
  });

  it('parcela cancelada some de listarParcelasPendentes', () => {
    const parcela = obterParcelaPorNumero(db, dividaId, 4);
    if (!parcela) throw new Error('parcela não encontrada no setup do teste');

    cancelarParcela(db, parcela.id);

    expect(listarParcelasPendentes(db, dividaId).map((p) => p.numeroParcela)).toEqual([1, 2, 3]);
  });
});

describe('incrementarParcelasPagas', () => {
  it('incrementa o contador sem quitar quando ainda faltam parcelas', () => {
    const divida = incrementarParcelasPagas(db, dividaId);

    expect(divida.parcelasPagas).toBe(1);
    expect(divida.status).toBe('ativo');
  });

  it('quita a dívida sozinha quando a última parcela é paga', () => {
    incrementarParcelasPagas(db, dividaId);
    incrementarParcelasPagas(db, dividaId);
    incrementarParcelasPagas(db, dividaId);
    const divida = incrementarParcelasPagas(db, dividaId);

    expect(divida.parcelasPagas).toBe(4);
    expect(divida.status).toBe('quitado');
    expect(obterDivida(db, dividaId)?.status).toBe('quitado');
  });
});
