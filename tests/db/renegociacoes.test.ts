import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { criarDivida, marcarDividaRenegociada, obterDivida } from '../../src/db/repositories/dividas.js';
import { migrate } from '../../src/db/migrate.js';
import { criarRenegociacao } from '../../src/db/repositories/renegociacoes.js';

const CHAVE_TESTE = 'chave-teste-renegociacoes';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-renegociacoes-test-'));
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

describe('marcarDividaRenegociada', () => {
  it('atualiza o status da dívida original para renegociado', () => {
    const { divida } = criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 1000,
      numParcelas: 4,
      dataInicio: '2026-09-01',
    });

    marcarDividaRenegociada(db, divida.id);

    expect(obterDivida(db, divida.id)?.status).toBe('renegociado');
  });
});

describe('criarRenegociacao', () => {
  it('grava origem tipo divida e a nova dívida gerada', () => {
    const { divida: origem } = criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 1000,
      numParcelas: 4,
      dataInicio: '2026-09-01',
    });
    const { divida: nova } = criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 800,
      numParcelas: 6,
      dataInicio: '2026-09-01',
    });

    const renegociacao = criarRenegociacao(db, {
      origemTipo: 'divida',
      origemId: origem.id,
      novaDividaId: nova.id,
      data: '2026-09-01',
    });

    expect(renegociacao.origemTipo).toBe('divida');
    expect(renegociacao.origemId).toBe(origem.id);
    expect(renegociacao.novaDividaId).toBe(nova.id);
    expect(renegociacao.motivo).toBeNull();
  });

  it('grava o motivo quando informado', () => {
    const { divida: origem } = criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 1000,
      numParcelas: 4,
      dataInicio: '2026-09-01',
    });
    const { divida: nova } = criarDivida(db, {
      contaId,
      tipo: 'emprestimo',
      valorTotal: 800,
      numParcelas: 6,
      dataInicio: '2026-09-01',
    });

    const renegociacao = criarRenegociacao(db, {
      origemTipo: 'divida',
      origemId: origem.id,
      novaDividaId: nova.id,
      motivo: 'taxa mais baixa',
      data: '2026-09-01',
    });

    expect(renegociacao.motivo).toBe('taxa mais baixa');
  });
});
