import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { definirRoteamento, listarRoteamentos, obterModeloRoteamento } from '../../src/db/repositories/roteamentoTarefas.js';

const CHAVE_TESTE = 'chave-teste-roteamento-tarefas';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-roteamento-tarefas-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('obterModeloRoteamento / definirRoteamento', () => {
  it('retorna undefined quando o fluxo não tem linha ainda', () => {
    expect(obterModeloRoteamento(db, 'conversa_texto')).toBeUndefined();
  });

  it('define e recupera o modelo preferido de um fluxo', () => {
    definirRoteamento(db, 'conversa_texto', 'qwen/qwen3-32b', 'tools');

    expect(obterModeloRoteamento(db, 'conversa_texto')).toBe('qwen/qwen3-32b');
  });

  it('atualiza o modelo preferido quando o fluxo já tem linha (ON CONFLICT)', () => {
    definirRoteamento(db, 'conversa_texto', 'qwen/qwen3-32b');
    definirRoteamento(db, 'conversa_texto', 'openai/gpt-4o');

    const linhas = db.prepare('SELECT * FROM roteamento_tarefas').all();
    expect(linhas).toHaveLength(1);
    expect(obterModeloRoteamento(db, 'conversa_texto')).toBe('openai/gpt-4o');
  });

  it('isola fluxos diferentes', () => {
    definirRoteamento(db, 'conversa_texto', 'openai/gpt-4o');
    definirRoteamento(db, 'resumir_contexto', 'openai/gpt-4o-mini');

    expect(obterModeloRoteamento(db, 'conversa_texto')).toBe('openai/gpt-4o');
    expect(obterModeloRoteamento(db, 'resumir_contexto')).toBe('openai/gpt-4o-mini');
  });

  it('aceita requisitos omitido', () => {
    definirRoteamento(db, 'conversa_texto', 'openai/gpt-4o');

    const linha = db.prepare('SELECT requisitos FROM roteamento_tarefas WHERE fluxo = ?').get('conversa_texto') as {
      requisitos: string | null;
    };
    expect(linha.requisitos).toBeNull();
  });
});

describe('listarRoteamentos', () => {
  it('retorna array vazio quando não há nenhuma linha', () => {
    expect(listarRoteamentos(db)).toEqual([]);
  });

  it('lista todas as linhas com os campos mapeados', () => {
    definirRoteamento(db, 'conversa_texto', 'openai/gpt-4o', 'tools');
    definirRoteamento(db, 'resumir_contexto', 'openai/gpt-4o-mini');

    const roteamentos = listarRoteamentos(db);

    expect(roteamentos).toEqual(
      expect.arrayContaining([
        { fluxo: 'conversa_texto', modeloPreferido: 'openai/gpt-4o', requisitos: 'tools' },
        { fluxo: 'resumir_contexto', modeloPreferido: 'openai/gpt-4o-mini', requisitos: null },
      ]),
    );
  });
});
