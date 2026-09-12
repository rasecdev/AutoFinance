import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  criarToolConsultarPatrimonioLiquido,
  criarToolProjetarFluxoCaixa,
} from '../../../src/ai/tools/projecaoFinanceira.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { migrate } from '../../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-tools-projecao-financeira';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tools-projecao-financeira-test-'));
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

describe('tool projetar_fluxo_caixa', () => {
  it('sem nenhum evento agendado, retorna mensagem informando que o saldo continua igual', async () => {
    const tool = criarToolProjetarFluxoCaixa(db);

    const resultado = await tool.handler({ dias: 30 }, { chatId: 1 });

    expect(resultado).toContain('nenhum vencimento agendado');
    expect(resultado).toContain('1000.00');
  });

  it('com conta inválida, retorna a mensagem de erro de resolverContaId', async () => {
    const tool = criarToolProjetarFluxoCaixa(db);

    const resultado = await tool.handler({ dias: 30, conta_apelido: 'Não existe' }, { chatId: 1 });

    expect(resultado).toMatch(/não encontrei|nenhuma conta/i);
  });

  it('com conta_id válido, cita o apelido da conta na resposta', async () => {
    const tool = criarToolProjetarFluxoCaixa(db);

    const resultado = await tool.handler({ dias: 30, conta_id: contaId }, { chatId: 1 });

    expect(resultado).toContain('Principal');
  });

  it('com evento vencendo dentro da janela, inclui aviso de saldo negativo quando aplicável', async () => {
    db.prepare(
      "INSERT INTO dividas (conta_id, tipo, valor_total, num_parcelas, valor_parcela, data_inicio) VALUES (?, 'emprestimo', 2000, 1, 2000, '2026-01-01')",
    ).run(contaId);
    const dividaId = db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number };
    const dataVencimento = new Date();
    dataVencimento.setDate(dataVencimento.getDate() + 5);
    const iso = `${dataVencimento.getFullYear()}-${String(dataVencimento.getMonth() + 1).padStart(2, '0')}-${String(dataVencimento.getDate()).padStart(2, '0')}`;
    db.prepare('INSERT INTO parcelas (divida_id, numero_parcela, valor, data_vencimento) VALUES (?, 1, 2000, ?)').run(
      dividaId.id,
      iso,
    );

    const tool = criarToolProjetarFluxoCaixa(db);
    const resultado = await tool.handler({ dias: 30, conta_id: contaId }, { chatId: 1 });

    expect(resultado).toContain('Vencimentos no período');
    expect(resultado).toContain('fica negativo');
  });
});

describe('tool consultar_patrimonio_liquido', () => {
  it('retorna PF, PJ e consolidado', async () => {
    const tool = criarToolConsultarPatrimonioLiquido(db);

    const resultado = await tool.handler({}, { chatId: 1 });

    expect(resultado).toContain('PF:');
    expect(resultado).toContain('PJ:');
    expect(resultado).toContain('Consolidado:');
    expect(resultado).toContain('1000.00');
  });
});
