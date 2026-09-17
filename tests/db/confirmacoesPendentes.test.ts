import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import {
  definirPendenciaPersistida,
  obterPendenciaPersistida,
  removerPendenciaPersistida,
} from '../../src/db/repositories/confirmacoesPendentes.js';
import { migrate } from '../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-confirmacoes-pendentes';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-confirmacoes-pendentes-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('confirmacoesPendentes — canal de confirmação entre processos', () => {
  it('grava e recupera uma pendência por chatId, com os argumentos desserializados', () => {
    definirPendenciaPersistida(db, 1001, { toolName: 'registrar_fatura_email', argumentos: { cartao_id: 5, valor: 850 } });

    expect(obterPendenciaPersistida(db, 1001)).toEqual({
      toolName: 'registrar_fatura_email',
      argumentos: { cartao_id: 5, valor: 850 },
    });
  });

  it('retorna undefined quando não há pendência pro chat', () => {
    expect(obterPendenciaPersistida(db, 9999)).toBeUndefined();
  });

  it('gravar de novo pro mesmo chat substitui a pendência anterior (upsert)', () => {
    definirPendenciaPersistida(db, 1002, { toolName: 'tool_antiga', argumentos: { x: 1 } });
    definirPendenciaPersistida(db, 1002, { toolName: 'tool_nova', argumentos: { y: 2 } });

    expect(obterPendenciaPersistida(db, 1002)).toEqual({ toolName: 'tool_nova', argumentos: { y: 2 } });

    const total = db.prepare('SELECT COUNT(*) as total FROM confirmacoes_pendentes WHERE chat_id = ?').get(1002) as {
      total: number;
    };
    expect(total.total).toBe(1);
  });

  it('remove a pendência', () => {
    definirPendenciaPersistida(db, 1003, { toolName: 'tool_teste', argumentos: {} });
    removerPendenciaPersistida(db, 1003);

    expect(obterPendenciaPersistida(db, 1003)).toBeUndefined();
  });

  it('não interfere entre chats diferentes', () => {
    definirPendenciaPersistida(db, 1004, { toolName: 'tool_a', argumentos: {} });
    definirPendenciaPersistida(db, 1005, { toolName: 'tool_b', argumentos: {} });

    expect(obterPendenciaPersistida(db, 1004)?.toolName).toBe('tool_a');
    expect(obterPendenciaPersistida(db, 1005)?.toolName).toBe('tool_b');

    removerPendenciaPersistida(db, 1004);
    expect(obterPendenciaPersistida(db, 1004)).toBeUndefined();
    expect(obterPendenciaPersistida(db, 1005)?.toolName).toBe('tool_b');
  });
});
