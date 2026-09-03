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
