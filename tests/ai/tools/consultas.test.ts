import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  criarToolConsultarSaldo,
  criarToolListarTransacoes,
  criarToolResumoMensal,
} from '../../../src/ai/tools/consultas.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { criarTransacao, excluirTransacao } from '../../../src/db/repositories/transacoes.js';
import { criarTransferencia } from '../../../src/db/repositories/transferencias.js';
import { migrate } from '../../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-tools-consultas';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tools-consultas-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaId = criarConta(db, {
    bancoNome: 'Nubank',
    tipo: 'PF',
    apelido: 'Conta principal',
    saldoInicial: 100,
  }).id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('tool consultar_saldo', () => {
  it('não exige confirmação (leitura)', () => {
    const tool = criarToolConsultarSaldo(db);
    expect(tool.requerConfirmacao).toBeUndefined();
  });

  it('soma saldo inicial com receitas e despesas ativas', async () => {
    criarTransacao(db, { contaId, tipo: 'receita', valor: 200, categoria: 'Salário', data: '2026-08-01' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 50, categoria: 'Alimentação', data: '2026-08-02' });

    const tool = criarToolConsultarSaldo(db);
    const args = tool.schema.parse({ conta_id: contaId });
    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('250.00');
  });

  it('ignora transação excluída no cálculo do saldo', async () => {
    const transacao = criarTransacao(db, {
      contaId,
      tipo: 'despesa',
      valor: 40,
      categoria: 'Alimentação',
      data: '2026-08-02',
    });
    excluirTransacao(db, transacao.id);

    const tool = criarToolConsultarSaldo(db);
    const args = tool.schema.parse({ conta_id: contaId });
    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('100.00');
  });

  it('resolve a conta pelo apelido e não expõe id', async () => {
    const tool = criarToolConsultarSaldo(db);
    const args = tool.schema.parse({ conta_apelido: 'conta principal' });
    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('100.00');
    expect(resultado).not.toMatch(/\bid\b/i);
  });

  it('reflete transferências enviadas e recebidas', async () => {
    const contaDestinoId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Destino' }).id;
    criarTransferencia(db, { contaOrigemId: contaId, contaDestinoId, valor: 30, taxa: 5, data: '2026-08-31' });

    const tool = criarToolConsultarSaldo(db);

    const resultadoOrigem = await tool.handler(tool.schema.parse({ conta_id: contaId }), { chatId: 1 });
    expect(resultadoOrigem).toContain('70.00');

    const resultadoDestino = await tool.handler(tool.schema.parse({ conta_id: contaDestinoId }), {
      chatId: 1,
    });
    expect(resultadoDestino).toContain('25.00');
  });
});

describe('tool listar_transacoes', () => {
  it('não exige confirmação (leitura)', () => {
    const tool = criarToolListarTransacoes(db);
    expect(tool.requerConfirmacao).toBeUndefined();
  });

  it('nunca lista transação excluída', async () => {
    criarTransacao(db, {
      contaId,
      tipo: 'despesa',
      valor: 10,
      categoria: 'Alimentação',
      data: '2026-08-01',
    });
    const excluida = criarTransacao(db, {
      contaId,
      tipo: 'despesa',
      valor: 20,
      categoria: 'Transporte',
      data: '2026-08-02',
    });
    excluirTransacao(db, excluida.id);

    const tool = criarToolListarTransacoes(db);
    const args = tool.schema.parse({ data_inicio: '2026-08-01', data_fim: '2026-08-31' });
    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('10.00');
    expect(resultado).not.toContain('20.00');
  });

  it('filtra por categoria e por período', async () => {
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 10, categoria: 'Alimentação', data: '2026-07-15' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 20, categoria: 'Alimentação', data: '2026-08-15' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 30, categoria: 'Transporte', data: '2026-08-15' });

    const tool = criarToolListarTransacoes(db);
    const args = tool.schema.parse({
      categoria: 'Alimentação',
      data_inicio: '2026-08-01',
      data_fim: '2026-08-31',
    });
    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('20.00');
    expect(resultado).not.toContain('10.00');
    expect(resultado).not.toContain('30.00');
  });

  it('sem transações encontradas, avisa sem lançar exceção', async () => {
    const tool = criarToolListarTransacoes(db);
    const args = tool.schema.parse({ categoria: 'Inexistente' });
    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Nenhuma transação');
  });

  it('inclui transferências da conta na listagem', async () => {
    const contaDestinoId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Destino' }).id;
    criarTransferencia(db, { contaOrigemId: contaId, contaDestinoId, valor: 40, taxa: 5, data: '2026-08-10' });

    const tool = criarToolListarTransacoes(db);
    const args = tool.schema.parse({ conta_id: contaId, data_inicio: '2026-08-01', data_fim: '2026-08-31' });
    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Transferência');
    expect(resultado).toContain('40.00');
    expect(resultado).toContain('35.00');
  });

  it('filtro por categoria exclui transferências (elas não têm categoria)', async () => {
    const contaDestinoId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Destino' }).id;
    criarTransferencia(db, { contaOrigemId: contaId, contaDestinoId, valor: 40, data: '2026-08-10' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 15, categoria: 'Alimentação', data: '2026-08-10' });

    const tool = criarToolListarTransacoes(db);
    const args = tool.schema.parse({
      conta_id: contaId,
      categoria: 'Alimentação',
      data_inicio: '2026-08-01',
      data_fim: '2026-08-31',
    });
    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).not.toContain('Transferência');
    expect(resultado).toContain('15.00');
  });

  it('sem período informado, usa o mês atual', async () => {
    const hoje = new Date();
    const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 15);
    const dataMesPassado = `${mesPassado.getFullYear()}-${String(mesPassado.getMonth() + 1).padStart(2, '0')}-15`;
    const dataMesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;

    criarTransacao(db, { contaId, tipo: 'despesa', valor: 11, categoria: 'Alimentação', data: dataMesPassado });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 22, categoria: 'Alimentação', data: dataMesAtual });

    const tool = criarToolListarTransacoes(db);
    const resultado = await tool.handler(tool.schema.parse({ conta_id: contaId }), { chatId: 1 });

    expect(resultado).toContain('22.00');
    expect(resultado).not.toContain('11.00');
  });
});

describe('tool resumo_mensal', () => {
  it('não exige confirmação (leitura)', () => {
    const tool = criarToolResumoMensal(db);
    expect(tool.requerConfirmacao).toBeUndefined();
  });

  it('agrega receita e despesa por categoria dentro do mês', async () => {
    criarTransacao(db, { contaId, tipo: 'receita', valor: 1000, categoria: 'Salário', data: '2026-08-05' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 100, categoria: 'Alimentação', data: '2026-08-10' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 50, categoria: 'Alimentação', data: '2026-08-20' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 999, categoria: 'Alimentação', data: '2026-07-31' });

    const tool = criarToolResumoMensal(db);
    const args = tool.schema.parse({ mes: '2026-08' });
    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('receita total R$ 1000.00');
    expect(resultado).toContain('despesa total R$ 150.00');
    expect(resultado).not.toContain('999.00');
  });

  it('não inclui transação excluída no resumo', async () => {
    const transacao = criarTransacao(db, {
      contaId,
      tipo: 'despesa',
      valor: 500,
      categoria: 'Alimentação',
      data: '2026-08-10',
    });
    excluirTransacao(db, transacao.id);

    const tool = criarToolResumoMensal(db);
    const args = tool.schema.parse({ mes: '2026-08' });
    const resultado = await tool.handler(args, { chatId: 1 });

    expect(resultado).toContain('Nenhuma movimentação encontrada em 2026-08');
  });

  it('inclui total enviado e recebido via transferência no resumo', async () => {
    const contaDestinoId = criarConta(db, { bancoNome: 'Itaú', tipo: 'PF', apelido: 'Destino' }).id;
    criarTransferencia(db, { contaOrigemId: contaId, contaDestinoId, valor: 40, taxa: 5, data: '2026-08-10' });

    const tool = criarToolResumoMensal(db);
    const resultadoOrigem = await tool.handler(
      tool.schema.parse({ mes: '2026-08', conta_id: contaId }),
      { chatId: 1 },
    );
    expect(resultadoOrigem).toContain('R$ 40.00 enviados');
    expect(resultadoOrigem).toContain('R$ 0.00 recebidos');
    expect(resultadoOrigem).toContain('"Conta principal" para "Destino"');

    const resultadoDestino = await tool.handler(
      tool.schema.parse({ mes: '2026-08', conta_id: contaDestinoId }),
      { chatId: 1 },
    );
    expect(resultadoDestino).toContain('R$ 0.00 enviados');
    expect(resultadoDestino).toContain('R$ 35.00 recebidos');
  });

  it('sem mês informado, usa o mês atual', async () => {
    const hoje = new Date();
    const dataMesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
    criarTransacao(db, { contaId, tipo: 'receita', valor: 77, categoria: 'Salário', data: dataMesAtual });

    const tool = criarToolResumoMensal(db);
    const resultado = await tool.handler(tool.schema.parse({}), { chatId: 1 });

    expect(resultado).toContain('receita total R$ 77.00');
  });

  it('rejeita mês em formato inválido', () => {
    const tool = criarToolResumoMensal(db);
    const validacao = tool.schema.safeParse({ mes: '08/2026' });
    expect(validacao.success).toBe(false);
  });
});
