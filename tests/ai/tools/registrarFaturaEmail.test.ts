import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarToolRegistrarFaturaEmail } from '../../../src/ai/tools/registrarFaturaEmail.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarCartao } from '../../../src/db/repositories/cartoes.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { buscarFaturaPorCartaoEMes } from '../../../src/db/repositories/faturas.js';
import { migrate } from '../../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-tools-registrar-fatura-email';

let dir: string;
let db: DbClient;
let cartaoId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tools-registrar-fatura-email-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  const contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' }).id;
  cartaoId = criarCartao(db, { contaId, nome: 'Nubank Cartão', limite: 5000, diaFechamento: 5, diaVencimento: 10 })
    .id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('tool registrar_fatura_email', () => {
  it('exige confirmação sempre', () => {
    const tool = criarToolRegistrarFaturaEmail(db);
    expect(tool.requerConfirmacao).toBe(true);
  });

  it('sem correspondência, cria fatura nova', async () => {
    const tool = criarToolRegistrarFaturaEmail(db);
    const args = tool.schema.parse({ cartao_id: cartaoId, mes_referencia: '2026-09', valor: 850 });

    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('criada');
    const fatura = buscarFaturaPorCartaoEMes(db, cartaoId, '2026-09');
    expect(fatura?.valor).toBe(850);
  });

  it('com correspondência, atualiza a fatura existente em vez de duplicar', async () => {
    const tool = criarToolRegistrarFaturaEmail(db);
    await tool.handler(tool.schema.parse({ cartao_id: cartaoId, mes_referencia: '2026-09', valor: 800 }), {
      chatId: 1,
    });

    const resultado = await tool.handler(
      tool.schema.parse({ cartao_id: cartaoId, mes_referencia: '2026-09', valor: 950 }),
      { chatId: 1 },
    );

    expect(resultado).toContain('atualizada');
    const fatura = buscarFaturaPorCartaoEMes(db, cartaoId, '2026-09');
    expect(fatura?.valor).toBe(950);

    const todas = db.prepare('SELECT COUNT(*) as total FROM faturas').get() as { total: number };
    expect(todas.total).toBe(1);
  });

  it('avisoConfirmacao deixa explícito se é atualização ou criação', () => {
    const tool = criarToolRegistrarFaturaEmail(db);
    const argsNova = tool.schema.parse({ cartao_id: cartaoId, mes_referencia: '2026-10', valor: 500 });
    expect(tool.avisoConfirmacao?.(argsNova)).toContain('CRIAR');

    db.prepare("INSERT INTO faturas (cartao_id, mes_referencia, valor, status) VALUES (?, '2026-11', 700, 'aberta')").run(
      cartaoId,
    );
    const argsExistente = tool.schema.parse({ cartao_id: cartaoId, mes_referencia: '2026-11', valor: 720 });
    expect(tool.avisoConfirmacao?.(argsExistente)).toContain('ATUALIZAR');
  });
});
