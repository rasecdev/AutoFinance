import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { createLogger } from '../../src/logging/logger.js';
import { expurgarDadosAntigos } from '../../src/scripts/expurgarDadosAntigos.js';

const CHAVE_TESTE = 'chave-teste-expurgar-dados-antigos';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-expurgar-dados-antigos-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const logger = createLogger(undefined, 'silent');
const AGORA = new Date(2026, 8, 23, 12, 0);

describe('expurgarDadosAntigos', () => {
  it('remove linhas mais antigas que a retenção nas tabelas operacionais', () => {
    db.prepare(
      `INSERT INTO interacoes_ia (trace_id, fluxo, modelo, resultado, data_hora)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('trace-antiga', 'conversa', 'modelo-x', 'sucesso', '2026-01-01T00:00:00.000Z');
    db.prepare(
      `INSERT INTO interacoes_ia (trace_id, fluxo, modelo, resultado, data_hora)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('trace-recente', 'conversa', 'modelo-x', 'sucesso', '2026-09-20T00:00:00.000Z');

    expurgarDadosAntigos(db, 90, logger, AGORA);

    const restantes = db.prepare('SELECT trace_id FROM interacoes_ia').all() as { trace_id: string }[];
    expect(restantes).toEqual([{ trace_id: 'trace-recente' }]);
  });

  it('não remove nada quando todas as linhas estão dentro da retenção', () => {
    db.prepare(
      `INSERT INTO uso_tokens (fluxo, modelo, tokens_prompt, tokens_completion, custo_estimado, origem, data_hora)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('conversa', 'modelo-x', 100, 50, 0.01, 'uso_real', '2026-09-20T00:00:00.000Z');

    expurgarDadosAntigos(db, 90, logger, AGORA);

    const restantes = db.prepare('SELECT id FROM uso_tokens').all();
    expect(restantes).toHaveLength(1);
  });

  it('nunca toca em transacoes ou contas_open_finance, mesmo com dados antigos', () => {
    const contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' }).id;
    db.prepare(
      `INSERT INTO transacoes (conta_id, tipo, valor, categoria, data)
       VALUES (?, 'despesa', 100, 'Mercado', '2020-01-01')`,
    ).run(contaId);

    expurgarDadosAntigos(db, 90, logger, AGORA);

    const restantes = db.prepare('SELECT id FROM transacoes').all();
    expect(restantes).toHaveLength(1);
  });
});
