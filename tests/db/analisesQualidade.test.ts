import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { registrarAnaliseQualidade } from '../../src/db/repositories/analisesQualidade.js';

const CHAVE_TESTE = 'chave-teste-analises-qualidade';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-analises-qualidade-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('registrarAnaliseQualidade', () => {
  it('insere uma linha recuperável com os valores passados', () => {
    registrarAnaliseQualidade(db, {
      periodo: '2026-09-01_2026-09-30',
      conteudoGerado: 'O fluxo conversa_texto teve 1 correção manual este mês.',
    });

    const linha = db.prepare('SELECT * FROM analises_qualidade').get() as {
      periodo: string;
      conteudo_gerado: string;
      data_hora: string;
    };

    expect(linha.periodo).toBe('2026-09-01_2026-09-30');
    expect(linha.conteudo_gerado).toBe('O fluxo conversa_texto teve 1 correção manual este mês.');
    expect(linha.data_hora).toEqual(expect.any(String));
  });
});
