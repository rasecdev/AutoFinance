import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarCartao } from '../../src/db/repositories/cartoes.js';
import type { DbClient } from '../../src/db/client.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { migrate } from '../../src/db/migrate.js';
import { calcularPatrimonioLiquido } from '../../src/relatorios/patrimonio.js';

const CHAVE_TESTE = 'chave-teste-patrimonio';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-patrimonio-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('calcularPatrimonioLiquido', () => {
  it('retorna tudo zerado quando não há nenhuma conta cadastrada', () => {
    const resultado = calcularPatrimonioLiquido(db);

    expect(resultado).toEqual({
      porTipo: [
        { tipo: 'PF', saldoContas: 0, saldoDevedorDividas: 0, valorFaturasAbertas: 0, patrimonioLiquido: 0 },
        { tipo: 'PJ', saldoContas: 0, saldoDevedorDividas: 0, valorFaturasAbertas: 0, patrimonioLiquido: 0 },
      ],
      consolidado: 0,
    });
  });

  it('soma saldo de contas por tipo, sem dívida nem fatura', () => {
    criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Pessoal', saldoInicial: 1000 });
    criarConta(db, { bancoNome: 'Itaú', tipo: 'PJ', apelido: 'PJ', saldoInicial: 5000 });

    const resultado = calcularPatrimonioLiquido(db);

    const pf = resultado.porTipo.find((item) => item.tipo === 'PF');
    const pj = resultado.porTipo.find((item) => item.tipo === 'PJ');
    expect(pf?.patrimonioLiquido).toBe(1000);
    expect(pj?.patrimonioLiquido).toBe(5000);
    expect(resultado.consolidado).toBe(6000);
  });

  it('subtrai saldo devedor de dívida ativa e valor de fatura aberta do tipo correto', () => {
    const contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Pessoal', saldoInicial: 1000 }).id;
    db.prepare(
      "INSERT INTO dividas (conta_id, tipo, valor_total, num_parcelas, valor_parcela, data_inicio) VALUES (?, 'emprestimo', 300, 1, 300, '2026-01-01')",
    ).run(contaId);
    const dividaId = (db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }).id;
    db.prepare('INSERT INTO parcelas (divida_id, numero_parcela, valor, data_vencimento) VALUES (?, 1, 300, ?)').run(
      dividaId,
      '2026-10-01',
    );

    const cartaoId = criarCartao(db, { contaId, nome: 'Cartão', limite: 2000, diaFechamento: 5, diaVencimento: 10 }).id;
    db.prepare("INSERT INTO faturas (cartao_id, mes_referencia, valor, status) VALUES (?, '2026-09', 200, 'aberta')").run(
      cartaoId,
    );

    const resultado = calcularPatrimonioLiquido(db);
    const pf = resultado.porTipo.find((item) => item.tipo === 'PF');

    expect(pf?.saldoDevedorDividas).toBe(300);
    expect(pf?.valorFaturasAbertas).toBe(200);
    expect(pf?.patrimonioLiquido).toBe(500);
  });
});
