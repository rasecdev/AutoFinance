import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { registrarErro } from '../../src/db/repositories/errosExecucao.js';
import { atualizarAvaliacaoInteracao, registrarInteracaoIa } from '../../src/db/repositories/interacoesIa.js';
import { agregarQualidadePeriodo } from '../../src/relatorios/qualidade.js';

const CHAVE_TESTE = 'chave-teste-relatorios-qualidade';

let dir: string;
let db: DbClient;

// Mesmo componente de data local usado por agregarQualidadePeriodo pra
// converter a janela em timestamp UTC (ver comentário equivalente em
// usoIa.test.ts/errosExecucao.test.ts).
function hoje(): { inicio: string; fim: string } {
  const agora = new Date();
  const iso = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  return { inicio: iso, fim: iso };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-relatorios-qualidade-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('agregarQualidadePeriodo', () => {
  it('retorna zerado quando não há interação nem erro no período', () => {
    const resultado = agregarQualidadePeriodo(db, hoje());

    expect(resultado).toEqual({
      porFluxoModelo: [],
      erroPorContexto: [],
      totalInteracoes: 0,
      totalIncorretas: 0,
      totalErrosTecnicos: 0,
    });
  });

  it('agrega interações e erros do período, com totais batendo com a soma dos agrupamentos', () => {
    registrarInteracaoIa(db, { traceId: 'trace-1', fluxo: 'conversa_texto', modelo: 'openai/gpt-4o-mini', resultado: 'sucesso' });
    registrarInteracaoIa(db, { traceId: 'trace-2', fluxo: 'conversa_texto', modelo: 'openai/gpt-4o-mini', resultado: 'sucesso' });
    registrarInteracaoIa(db, { traceId: 'trace-3', fluxo: 'relatorio_mensal', modelo: 'deepseek/deepseek-v4-flash', resultado: 'sucesso' });
    atualizarAvaliacaoInteracao(db, 'trace-1', 'incorreto');
    atualizarAvaliacaoInteracao(db, 'trace-2', 'correto');
    atualizarAvaliacaoInteracao(db, 'trace-3', 'correto');

    registrarErro(db, { contexto: 'backup', mensagem: 'erro 1' });
    registrarErro(db, { contexto: 'backup', mensagem: 'erro 2' });
    registrarErro(db, { contexto: 'monitorar_precos', mensagem: 'erro 3' });

    const resultado = agregarQualidadePeriodo(db, hoje());

    expect(resultado.totalInteracoes).toBe(3);
    expect(resultado.totalIncorretas).toBe(1);
    expect(resultado.totalErrosTecnicos).toBe(3);
    expect(resultado.porFluxoModelo).toEqual(
      expect.arrayContaining([
        { fluxo: 'conversa_texto', modelo: 'openai/gpt-4o-mini', total: 2, incorretas: 1 },
        { fluxo: 'relatorio_mensal', modelo: 'deepseek/deepseek-v4-flash', total: 1, incorretas: 0 },
      ]),
    );
    expect(resultado.erroPorContexto).toEqual(
      expect.arrayContaining([
        { contexto: 'backup', total: 2 },
        { contexto: 'monitorar_precos', total: 1 },
      ]),
    );
  });
});
