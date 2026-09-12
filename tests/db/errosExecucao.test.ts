import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import {
  agruparErrosPorContexto,
  contarErrosPeriodo,
  listarErros,
  registrarErro,
} from '../../src/db/repositories/errosExecucao.js';

const CHAVE_TESTE = 'chave-teste-erros-execucao';

let dir: string;
let db: DbClient;

// Mesma data local usada por contarErrosPeriodo/listarErros pra converter a
// janela em timestamp UTC — ver comentário equivalente em usoIa.test.ts.
function hoje(): { inicio: string; fim: string } {
  const agora = new Date();
  const iso = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  return { inicio: iso, fim: iso };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-erros-execucao-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('registrarErro', () => {
  it('grava uma linha com data_hora preenchido e resolvido false', () => {
    const erro = registrarErro(db, { contexto: 'monitorar_precos', mensagem: 'falha ao buscar catálogo' });

    expect(erro).toEqual({
      id: expect.any(Number),
      traceId: null,
      contexto: 'monitorar_precos',
      mensagem: 'falha ao buscar catálogo',
      detalhes: null,
      dataHora: expect.any(String),
      resolvido: false,
    });
  });

  it('aceita traceId e detalhes opcionais', () => {
    const erro = registrarErro(db, {
      contexto: 'conversa_texto',
      mensagem: 'timeout',
      traceId: 'trace-123',
      detalhes: 'stack trace aqui',
    });

    expect(erro.traceId).toBe('trace-123');
    expect(erro.detalhes).toBe('stack trace aqui');
  });
});

describe('listarErros', () => {
  it('retorna array vazio quando não há erro no período', () => {
    expect(listarErros(db, hoje())).toEqual([]);
  });

  it('lista erros do período, mais recente primeiro', () => {
    registrarErro(db, { contexto: 'backup', mensagem: 'primeiro erro' });
    registrarErro(db, { contexto: 'monitorar_precos', mensagem: 'segundo erro' });

    const erros = listarErros(db, hoje());

    expect(erros.map((e) => e.mensagem)).toEqual(['segundo erro', 'primeiro erro']);
  });

  it('não inclui erro fora do período', () => {
    db.prepare(
      `INSERT INTO erros_execucao (contexto, mensagem, data_hora, resolvido) VALUES ('backup', 'erro antigo', '2000-01-01T00:00:00.000Z', 0)`,
    ).run();

    expect(listarErros(db, hoje())).toEqual([]);
  });
});

describe('contarErrosPeriodo', () => {
  it('retorna 0 quando não há erro no período', () => {
    expect(contarErrosPeriodo(db, hoje())).toBe(0);
  });

  it('conta os erros dentro da janela do período', () => {
    registrarErro(db, { contexto: 'backup', mensagem: 'erro 1' });
    registrarErro(db, { contexto: 'monitorar_precos', mensagem: 'erro 2' });

    expect(contarErrosPeriodo(db, hoje())).toBe(2);
  });

  it('não conta erro fora do período', () => {
    db.prepare(
      `INSERT INTO erros_execucao (contexto, mensagem, data_hora, resolvido) VALUES ('backup', 'erro antigo', '2000-01-01T00:00:00.000Z', 0)`,
    ).run();

    expect(contarErrosPeriodo(db, hoje())).toBe(0);
  });
});

describe('agruparErrosPorContexto (Fase 6, Tarefa 56)', () => {
  it('retorna lista vazia quando não há erro no período', () => {
    expect(agruparErrosPorContexto(db, hoje())).toEqual([]);
  });

  it('agrupa contagem por contexto dentro da janela do período', () => {
    registrarErro(db, { contexto: 'backup', mensagem: 'erro 1' });
    registrarErro(db, { contexto: 'backup', mensagem: 'erro 2' });
    registrarErro(db, { contexto: 'monitorar_precos', mensagem: 'erro 3' });

    const resultado = agruparErrosPorContexto(db, hoje());

    expect(resultado).toEqual(
      expect.arrayContaining([
        { contexto: 'backup', total: 2 },
        { contexto: 'monitorar_precos', total: 1 },
      ]),
    );
    expect(resultado).toHaveLength(2);
  });

  it('não conta erro fora do período', () => {
    db.prepare(
      `INSERT INTO erros_execucao (contexto, mensagem, data_hora, resolvido) VALUES ('backup', 'erro antigo', '2000-01-01T00:00:00.000Z', 0)`,
    ).run();

    expect(agruparErrosPorContexto(db, hoje())).toEqual([]);
  });
});
