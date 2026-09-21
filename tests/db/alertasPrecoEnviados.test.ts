import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { jaFoiAlertado, registrarAlertaEnviado } from '../../src/db/repositories/alertasPrecoEnviados.js';

const CHAVE_TESTE = 'chave-teste-alertas-preco-enviados';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-alertas-preco-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('jaFoiAlertado / registrarAlertaEnviado', () => {
  it('não considera alertado antes de registrar', () => {
    expect(jaFoiAlertado(db, { fluxo: 'conversa_texto', tipo: 'preco_mudou', modelo: 'openai/gpt-4o-mini', preco: 2 })).toBe(
      false,
    );
  });

  it('considera alertado depois de registrar o mesmo fluxo+tipo+modelo+preco', () => {
    registrarAlertaEnviado(db, { fluxo: 'conversa_texto', tipo: 'preco_mudou', modelo: 'openai/gpt-4o-mini', preco: 2 });

    expect(jaFoiAlertado(db, { fluxo: 'conversa_texto', tipo: 'preco_mudou', modelo: 'openai/gpt-4o-mini', preco: 2 })).toBe(
      true,
    );
  });

  it('não considera alertado quando o preço muda de novo (informação nova)', () => {
    registrarAlertaEnviado(db, { fluxo: 'conversa_texto', tipo: 'preco_mudou', modelo: 'openai/gpt-4o-mini', preco: 2 });

    expect(jaFoiAlertado(db, { fluxo: 'conversa_texto', tipo: 'preco_mudou', modelo: 'openai/gpt-4o-mini', preco: 3 })).toBe(
      false,
    );
  });

  it('registrar duas vezes o mesmo alerta não quebra (INSERT OR IGNORE)', () => {
    const alerta = { fluxo: 'conversa_texto', tipo: 'modelo_mais_barato', modelo: 'qwen/qwen3-32b', preco: 1 };

    expect(() => {
      registrarAlertaEnviado(db, alerta);
      registrarAlertaEnviado(db, alerta);
    }).not.toThrow();
    expect(jaFoiAlertado(db, alerta)).toBe(true);
  });
});
