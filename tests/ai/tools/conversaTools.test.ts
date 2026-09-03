import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { montarToolsConversa } from '../../../src/ai/tools/conversaTools.js';
import type { DbClient } from '../../../src/db/client.js';
import { migrate } from '../../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-conversa-tools';

let dir: string;
let db: DbClient;
const clienteFalso = {} as OpenAI;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-conversa-tools-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('montarToolsConversa', () => {
  it('retorna todas as ferramentas do fluxo conversa_texto, sem duplicar nome', () => {
    const tools = montarToolsConversa(db, clienteFalso);

    expect(tools.length).toBeGreaterThan(0);
    const nomes = tools.map((t) => t.name);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it('inclui a tool de relatório, curadoria de benchmark e execução do benchmark interno', () => {
    const nomes = montarToolsConversa(db, clienteFalso).map((t) => t.name);

    expect(nomes).toContain('relatorio');
    expect(nomes).toContain('criar_caso_teste_benchmark');
    expect(nomes).toContain('rodar_benchmark_interno');
  });
});
