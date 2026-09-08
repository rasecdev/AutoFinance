import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarToolListarErros } from '../../../src/ai/tools/errosExecucao.js';
import type { DbClient } from '../../../src/db/client.js';
import { migrate } from '../../../src/db/migrate.js';
import { registrarErro } from '../../../src/db/repositories/errosExecucao.js';

const CHAVE_TESTE = 'chave-teste-tools-erros-execucao';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tools-erros-execucao-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('tool listar_erros', () => {
  it('retorna mensagem clara quando não há erro no período', async () => {
    const tool = criarToolListarErros(db);

    const resultado = await tool.handler({ periodo: 'dia' }, { chatId: 1 });

    expect(resultado).toContain('Nenhum erro técnico registrado no período');
  });

  it('lista os erros registrados no período com contexto e mensagem', async () => {
    registrarErro(db, { contexto: 'backup', mensagem: 'disco cheio' });
    registrarErro(db, { contexto: 'monitorar_precos', mensagem: 'timeout na API' });
    const tool = criarToolListarErros(db);

    const resultado = await tool.handler({ periodo: 'dia' }, { chatId: 1 });

    expect(resultado).toContain('backup: disco cheio');
    expect(resultado).toContain('monitorar_precos: timeout na API');
  });

  it('funciona pra periodo=semana e periodo=mes sem lançar erro', async () => {
    const tool = criarToolListarErros(db);

    const semana = await tool.handler({ periodo: 'semana' }, { chatId: 1 });
    const mes = await tool.handler({ periodo: 'mes' }, { chatId: 1 });

    expect(semana).toContain('Nenhum erro técnico registrado no período');
    expect(mes).toContain('Nenhum erro técnico registrado no período');
  });
});
