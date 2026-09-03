import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarToolRelatorio } from '../../../src/ai/tools/relatorios.js';
import type { DbClient } from '../../../src/db/client.js';
import { migrate } from '../../../src/db/migrate.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { criarTransacao } from '../../../src/db/repositories/transacoes.js';
import { registrarUsoTokens } from '../../../src/db/repositories/usoTokens.js';

const CHAVE_TESTE = 'chave-teste-tools-relatorios';

let dir: string;
let db: DbClient;

function hojeISO(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tools-relatorios-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('tool relatorio', () => {
  it('retorna relatório do dia vazio quando não há nada registrado', async () => {
    const tool = criarToolRelatorio(db);

    const resultado = await tool.handler({ periodo: 'dia' }, { chatId: 1 });

    expect(resultado).toContain(hojeISO());
    expect(resultado).toContain('Nenhuma transação no período.');
    expect(resultado).toContain('Nenhum uso de IA registrado no período.');
  });

  it('inclui transação registrada hoje no relatório do dia', async () => {
    const contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal', saldoInicial: 100 }).id;
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 30, categoria: 'transporte', data: hojeISO() });
    const tool = criarToolRelatorio(db);

    const resultado = await tool.handler({ periodo: 'dia' }, { chatId: 1 });

    expect(resultado).toContain('transporte');
    expect(resultado).toContain('R$ 30.00');
  });

  it('inclui uso de IA registrado hoje no relatório do dia', async () => {
    registrarUsoTokens(db, {
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      tokensPrompt: 100,
      tokensCompletion: 20,
      custoEstimado: 0.01,
      origem: 'uso_real',
    });
    const tool = criarToolRelatorio(db);

    const resultado = await tool.handler({ periodo: 'dia' }, { chatId: 1 });

    expect(resultado).toContain('conversa_texto');
    expect(resultado).toContain('120 tokens');
  });

  it('funciona pra periodo=semana e periodo=mes sem lançar erro', async () => {
    const tool = criarToolRelatorio(db);

    const semana = await tool.handler({ periodo: 'semana' }, { chatId: 1 });
    const mes = await tool.handler({ periodo: 'mes' }, { chatId: 1 });

    expect(semana).toContain('**Relatório');
    expect(mes).toContain('**Relatório');
  });
});
