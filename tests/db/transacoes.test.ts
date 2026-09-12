import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { criarCartao } from '../../src/db/repositories/cartoes.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import {
  atualizarTransacao,
  criarTransacao,
  excluirTransacao,
  listarTransacoesAtivas,
  obterTransacao,
} from '../../src/db/repositories/transacoes.js';

const CHAVE_TESTE = 'chave-teste-transacoes';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-transacoes-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Conta principal' }).id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('criarTransacao', () => {
  it('grava com status ativa', () => {
    const transacao = criarTransacao(db, {
      contaId,
      tipo: 'despesa',
      valor: 50,
      categoria: 'Alimentação',
      data: '2026-08-31',
    });

    expect(transacao.status).toBe('ativa');
    expect(obterTransacao(db, transacao.id)).toMatchObject({ status: 'ativa', valor: 50 });
  });

  it('exige conta_id ou cartao_id no banco (constraint), mas aceita qualquer um isoladamente', () => {
    const transacao = criarTransacao(db, {
      cartaoId: undefined,
      contaId,
      tipo: 'receita',
      valor: 1000,
      categoria: 'Salário',
      data: '2026-08-31',
    });

    expect(transacao.contaId).toBe(contaId);
    expect(transacao.cartaoId).toBeNull();
  });
});

describe('atualizarTransacao', () => {
  it('atualiza os campos informados e mantém os demais', () => {
    const transacao = criarTransacao(db, {
      contaId,
      tipo: 'despesa',
      valor: 50,
      categoria: 'Alimentação',
      data: '2026-08-31',
    });

    const atualizada = atualizarTransacao(db, transacao.id, { valor: 75, categoria: 'Transporte' });

    expect(atualizada).toMatchObject({ valor: 75, categoria: 'Transporte', data: '2026-08-31' });
  });

  it('retorna undefined para id inexistente', () => {
    expect(atualizarTransacao(db, 9999, { valor: 10 })).toBeUndefined();
  });
});

describe('excluirTransacao', () => {
  it('marca status como excluida em vez de remover a linha', () => {
    const transacao = criarTransacao(db, {
      contaId,
      tipo: 'despesa',
      valor: 50,
      categoria: 'Alimentação',
      data: '2026-08-31',
    });

    const excluida = excluirTransacao(db, transacao.id);

    expect(excluida).toBe(true);
    expect(obterTransacao(db, transacao.id)).toMatchObject({ status: 'excluida' });
  });

  it('retorna false para id inexistente ou já excluído', () => {
    const transacao = criarTransacao(db, {
      contaId,
      tipo: 'despesa',
      valor: 50,
      categoria: 'Alimentação',
      data: '2026-08-31',
    });

    excluirTransacao(db, transacao.id);

    expect(excluirTransacao(db, transacao.id)).toBe(false);
    expect(excluirTransacao(db, 9999)).toBe(false);
  });
});

describe('listarTransacoesAtivas com filtro cartaoId (Fase 6, Tarefa 61)', () => {
  it('filtra só transações do cartão informado', () => {
    const cartaoId = criarCartao(db, {
      contaId,
      nome: 'Cartão Teste',
      limite: 1000,
      diaFechamento: 20,
      diaVencimento: 28,
    }).id;

    criarTransacao(db, { cartaoId, tipo: 'despesa', valor: 100, categoria: 'Compras', data: '2026-09-05' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 50, categoria: 'Alimentação', data: '2026-09-05' });

    const resultado = listarTransacoesAtivas(db, { cartaoId });

    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.cartaoId).toBe(cartaoId);
    expect(resultado[0]?.valor).toBe(100);
  });

  it('combina cartaoId com dataInicio', () => {
    const cartaoId = criarCartao(db, {
      contaId,
      nome: 'Cartão Teste',
      limite: 1000,
      diaFechamento: 20,
      diaVencimento: 28,
    }).id;

    criarTransacao(db, { cartaoId, tipo: 'despesa', valor: 100, categoria: 'Compras', data: '2026-08-15' });
    criarTransacao(db, { cartaoId, tipo: 'despesa', valor: 200, categoria: 'Compras', data: '2026-09-05' });

    const resultado = listarTransacoesAtivas(db, { cartaoId, dataInicio: '2026-09-01' });

    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.valor).toBe(200);
  });

  it('sem cartaoId informado, comportamento inalterado', () => {
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 50, categoria: 'Alimentação', data: '2026-08-31' });

    expect(listarTransacoesAtivas(db)).toHaveLength(1);
  });
});
