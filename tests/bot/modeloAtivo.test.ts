import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MODELO_PADRAO } from '../../src/ai/openrouter.js';
import { definirModeloAtivo, obterOverrideModelo, resolverModeloConversa } from '../../src/bot/modeloAtivo.js';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { definirRoteamento } from '../../src/db/repositories/roteamentoTarefas.js';

const CHAVE_TESTE = 'chave-teste-modelo-ativo';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-modelo-ativo-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('obterOverrideModelo / definirModeloAtivo', () => {
  it('retorna undefined quando o chat nunca trocou de modelo', () => {
    expect(obterOverrideModelo(1234567)).toBeUndefined();
  });

  it('guarda e retorna o override por chat', () => {
    definirModeloAtivo(1, 'openai/gpt-4o');
    definirModeloAtivo(1, 'anthropic/claude-3-haiku');

    expect(obterOverrideModelo(1)).toBe('anthropic/claude-3-haiku');
  });

  it('isola o override entre chats diferentes', () => {
    definirModeloAtivo(2, 'openai/gpt-4o');
    definirModeloAtivo(3, 'qwen/qwen3-32b');

    expect(obterOverrideModelo(2)).toBe('openai/gpt-4o');
    expect(obterOverrideModelo(3)).toBe('qwen/qwen3-32b');
  });
});

describe('resolverModeloConversa (Fase 5, Tarefa 22 — precedência override > roteamento > padrão)', () => {
  it('cai pra MODELO_PADRAO quando não há override nem roteamento', () => {
    expect(resolverModeloConversa(db, 999001)).toBe(MODELO_PADRAO);
  });

  it('usa o modelo de roteamento_tarefas quando não há override', () => {
    definirRoteamento(db, 'conversa_texto', 'qwen/qwen3-32b');

    expect(resolverModeloConversa(db, 999002)).toBe('qwen/qwen3-32b');
  });

  it('override do chat vence roteamento_tarefas', () => {
    definirRoteamento(db, 'conversa_texto', 'qwen/qwen3-32b');
    definirModeloAtivo(999003, 'openai/gpt-4o');

    expect(resolverModeloConversa(db, 999003)).toBe('openai/gpt-4o');
  });
});
