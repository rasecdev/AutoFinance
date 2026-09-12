import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { migrate } from '../../src/db/migrate.js';
import { criarTransacao } from '../../src/db/repositories/transacoes.js';
import { calcularGastoCicloAtualCartao } from '../../src/relatorios/limiteCartao.js';

const CHAVE_TESTE = 'chave-teste-limite-cartao';

let dir: string;
let db: DbClient;
let contaId: number;
let cartaoId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-limite-cartao-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' }).id;
  cartaoId = db
    .prepare('INSERT INTO cartoes (conta_id, nome, limite, dia_fechamento, dia_vencimento) VALUES (?, ?, ?, ?, ?)')
    .run(contaId, 'Cartão', 1000, 15, 22).lastInsertRowid as number;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('calcularGastoCicloAtualCartao', () => {
  it('soma só despesas do ciclo atual (dentro do ciclo aberto pelo dia_fechamento)', () => {
    const hoje = new Date(2026, 8, 20); // 2026-09-20, fechamento dia 15 -> ciclo atual começa 2026-09-16
    criarTransacao(db, { cartaoId, tipo: 'despesa', valor: 100, categoria: 'Compras', data: '2026-09-18' });
    criarTransacao(db, { cartaoId, tipo: 'despesa', valor: 50, categoria: 'Compras', data: '2026-09-10' }); // ciclo anterior
    criarTransacao(db, { cartaoId, tipo: 'receita', valor: 30, categoria: 'Reembolso', data: '2026-09-18' }); // ignora receita

    expect(calcularGastoCicloAtualCartao(db, cartaoId, 15, hoje)).toBe(100);
  });

  it('quando hoje ainda não passou do fechamento, ciclo atual começa no mês anterior', () => {
    const hoje = new Date(2026, 8, 10); // 2026-09-10, antes do fechamento (dia 15)
    criarTransacao(db, { cartaoId, tipo: 'despesa', valor: 200, categoria: 'Compras', data: '2026-08-20' }); // dentro do ciclo (começou 2026-08-16)

    expect(calcularGastoCicloAtualCartao(db, cartaoId, 15, hoje)).toBe(200);
  });

  it('retorna 0 quando não há despesa no ciclo atual', () => {
    const hoje = new Date(2026, 8, 20);
    expect(calcularGastoCicloAtualCartao(db, cartaoId, 15, hoje)).toBe(0);
  });
});
