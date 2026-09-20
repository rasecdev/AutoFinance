import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate.js';

const TABELAS_ESPERADAS = [
  'bancos',
  'contas',
  'cartoes',
  'faturas',
  'transacoes',
  'dividas',
  'parcelas',
  'renegociacoes',
  'roteamento_tarefas',
  'modelos_openrouter_historico',
  'uso_tokens',
  'metas',
  'transferencias',
  'despesas_fixas',
  'interacoes_ia',
  'resumos_conversa',
  'modelos_referencia_comparacao',
  'casos_teste_benchmark',
  'benchmarks_modelos',
];

const CHAVE_TESTE = 'chave-teste-migracao';

let dir: string;
let caminhoBanco: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-db-test-'));
  caminhoBanco = join(dir, 'teste.db');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('migrate', () => {
  it('cria todas as tabelas do modelo de dados', () => {
    const db = new Database(caminhoBanco);
    db.pragma("cipher='sqlcipher'");
    db.pragma(`key='${CHAVE_TESTE}'`);

    migrate(db);

    const tabelas = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => (row as { name: string }).name);

    for (const tabela of TABELAS_ESPERADAS) {
      expect(tabelas).toContain(tabela);
    }

    db.close();
  });

  it('não roda a mesma migração duas vezes', () => {
    const db = new Database(caminhoBanco);
    db.pragma("cipher='sqlcipher'");
    db.pragma(`key='${CHAVE_TESTE}'`);

    migrate(db);
    expect(() => migrate(db)).not.toThrow();

    db.close();
  });

  it('adiciona chat_id e tokens em interacoes_ia (Fase 4, Tarefa 17)', () => {
    const db = new Database(caminhoBanco);
    db.pragma("cipher='sqlcipher'");
    db.pragma(`key='${CHAVE_TESTE}'`);

    migrate(db);

    const colunas = db
      .prepare('PRAGMA table_info(interacoes_ia)')
      .all()
      .map((row) => (row as { name: string }).name);

    expect(colunas).toEqual(
      expect.arrayContaining(['chat_id', 'tokens_prompt', 'tokens_completion']),
    );

    db.close();
  });

  it('cria emails_processados e evento_calendario_id em faturas/parcelas (Fase 7, Tarefa 89)', () => {
    const db = new Database(caminhoBanco);
    db.pragma("cipher='sqlcipher'");
    db.pragma(`key='${CHAVE_TESTE}'`);

    migrate(db);

    const tabelas = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tabelas).toContain('emails_processados');

    expect(() =>
      db
        .prepare(
          `INSERT INTO emails_processados (gmail_message_id, processado_em, resultado)
           VALUES ('msg-1', datetime('now'), 'pendente_confirmacao')`,
        )
        .run(),
    ).not.toThrow();

    expect(() =>
      db
        .prepare(
          `INSERT INTO emails_processados (gmail_message_id, processado_em, resultado)
           VALUES ('msg-1', datetime('now'), 'sem_correspondencia')`,
        )
        .run(),
    ).toThrow();

    const colunasFaturas = db
      .prepare('PRAGMA table_info(faturas)')
      .all()
      .map((row) => (row as { name: string }).name);
    expect(colunasFaturas).toContain('evento_calendario_id');

    const colunasParcelas = db
      .prepare('PRAGMA table_info(parcelas)')
      .all()
      .map((row) => (row as { name: string }).name);
    expect(colunasParcelas).toContain('evento_calendario_id');

    db.close();
  });

  it('cria confirmacoes_pendentes, chat_id único (upsert) (Fase 7, achado de teste manual 2026-09-17)', () => {
    const db = new Database(caminhoBanco);
    db.pragma("cipher='sqlcipher'");
    db.pragma(`key='${CHAVE_TESTE}'`);

    migrate(db);

    const tabelas = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tabelas).toContain('confirmacoes_pendentes');

    db.prepare(
      "INSERT INTO confirmacoes_pendentes (chat_id, tool_name, argumentos, criado_em) VALUES (1, 'x', '{}', datetime('now'))",
    ).run();

    expect(() =>
      db
        .prepare(
          "INSERT INTO confirmacoes_pendentes (chat_id, tool_name, argumentos, criado_em) VALUES (1, 'y', '{}', datetime('now'))",
        )
        .run(),
    ).toThrow();

    db.close();
  });

  it('cria contas_open_finance, transacoes_open_finance_processadas e origem/trace_id em transacoes (Fase 8, Tarefa 98)', () => {
    const db = new Database(caminhoBanco);
    db.pragma("cipher='sqlcipher'");
    db.pragma(`key='${CHAVE_TESTE}'`);

    migrate(db);

    const tabelas = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tabelas).toContain('contas_open_finance');
    expect(tabelas).toContain('transacoes_open_finance_processadas');

    db.prepare("INSERT INTO bancos (nome) VALUES ('Banco Teste')").run();
    db.prepare("INSERT INTO contas (banco_id, tipo, apelido) VALUES (1, 'PF', 'Principal')").run();

    // pluggy_account_id único
    db.prepare(
      "INSERT INTO contas_open_finance (pluggy_item_id, pluggy_account_id, conta_id, criado_em) VALUES ('item-1', 'conta-pluggy-1', 1, datetime('now'))",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO contas_open_finance (pluggy_item_id, pluggy_account_id, conta_id, criado_em) VALUES ('item-2', 'conta-pluggy-1', 2, datetime('now'))",
        )
        .run(),
    ).toThrow();

    // exige conta_id OU cartao_id, nunca os dois nulos
    expect(() =>
      db
        .prepare(
          "INSERT INTO contas_open_finance (pluggy_item_id, pluggy_account_id, criado_em) VALUES ('item-3', 'conta-pluggy-2', datetime('now'))",
        )
        .run(),
    ).toThrow();

    // pluggy_transaction_id único
    db.prepare(
      "INSERT INTO transacoes_open_finance_processadas (pluggy_transaction_id, processado_em, resultado) VALUES ('tx-1', datetime('now'), 'transacao_criada')",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO transacoes_open_finance_processadas (pluggy_transaction_id, processado_em, resultado) VALUES ('tx-1', datetime('now'), 'saque_ignorado')",
        )
        .run(),
    ).toThrow();

    const colunasTransacoes = db
      .prepare('PRAGMA table_info(transacoes)')
      .all()
      .map((row) => (row as { name: string }).name);
    expect(colunasTransacoes).toContain('origem');
    expect(colunasTransacoes).toContain('trace_id');

    db.prepare(
      "INSERT INTO transacoes (conta_id, tipo, valor, categoria, data) VALUES (1, 'despesa', 10, 'mercado', '2026-09-20')",
    ).run();
    const origem = db.prepare('SELECT origem FROM transacoes').get() as { origem: string };
    expect(origem.origem).toBe('manual');

    db.close();
  });

  it('banco cifrado não pode ser lido sem a chave correta', () => {
    const db = new Database(caminhoBanco);
    db.pragma("cipher='sqlcipher'");
    db.pragma(`key='${CHAVE_TESTE}'`);
    migrate(db);
    db.close();

    expect(existsSync(caminhoBanco)).toBe(true);

    const semChave = new Database(caminhoBanco);
    expect(() => semChave.prepare('SELECT * FROM bancos').all()).toThrow();
    semChave.close();
  });
});
