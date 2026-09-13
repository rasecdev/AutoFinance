import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarToolConsultarDadosDinamico } from '../../../src/ai/tools/consultaDinamica.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { criarTransacao } from '../../../src/db/repositories/transacoes.js';
import { migrate } from '../../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-tool-consulta-dinamica';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tool-consulta-dinamica-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal', saldoInicial: 1000 }).id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('tool consultar_dados_dinamico', () => {
  it('pergunta simples (1 dimensão) retorna resultado com eco de interpretação', async () => {
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 100, categoria: 'Mercado', data: '2026-09-01' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 300, categoria: 'Transporte', data: '2026-09-02' });

    const tool = criarToolConsultarDadosDinamico(db);
    const resultado = await tool.handler(
      { dominio: 'financeiro', metrica: 'soma_valor', agrupar_por: ['categoria'], ordenar_por: 'desc', limite: 1 },
      { chatId: 1 },
    );

    expect(resultado).toContain('Interpretação:');
    expect(resultado).toContain('domínio "financeiro"');
    expect(resultado).toContain('mês atual, nenhum período foi informado');
    expect(resultado).toContain('Transporte: 300.00');
    expect(resultado).not.toContain('Mercado');
  });

  it('sem período informado e sem "mes" em agrupar_por, aplica mês atual como padrão (nunca some sem eco)', async () => {
    const mesPassado = new Date();
    mesPassado.setMonth(mesPassado.getMonth() - 2);
    const dataAntiga = `${mesPassado.getFullYear()}-${String(mesPassado.getMonth() + 1).padStart(2, '0')}-01`;
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 999, categoria: 'ForaDoMes', data: dataAntiga });

    const tool = criarToolConsultarDadosDinamico(db);
    const resultado = await tool.handler(
      { dominio: 'financeiro', metrica: 'soma_valor', agrupar_por: ['categoria'] },
      { chatId: 1 },
    );

    expect(resultado).toContain('mês atual');
    expect(resultado).not.toContain('ForaDoMes');
  });

  it('sem período informado, mas com "mes" em agrupar_por, não aplica default (é tendência multi-mês)', async () => {
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 100, categoria: 'Mercado', data: '2026-01-01' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 200, categoria: 'Mercado', data: '2026-09-01' });

    const tool = criarToolConsultarDadosDinamico(db);
    const resultado = await tool.handler(
      { dominio: 'financeiro', metrica: 'soma_valor', agrupar_por: ['categoria', 'mes'] },
      { chatId: 1 },
    );

    expect(resultado).toContain('sem filtro de período (todo o histórico)');
    expect(resultado).toContain('jan/26');
    expect(resultado).toContain('set/26');
  });

  it('pergunta composta (2 dimensões) retorna resultado agrupado por série', async () => {
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 100, categoria: 'Mercado', data: '2026-07-01' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 200, categoria: 'Mercado', data: '2026-08-01' });

    const tool = criarToolConsultarDadosDinamico(db);
    const resultado = await tool.handler(
      { dominio: 'financeiro', metrica: 'soma_valor', agrupar_por: ['categoria', 'mes'] },
      { chatId: 1 },
    );

    expect(resultado).toContain('Mercado / jul/26: 100.00');
    expect(resultado).toContain('Mercado / ago/26: 200.00');
  });

  it('dominio uso_ia funciona chamando o mesmo motor', async () => {
    db.prepare(
      `INSERT INTO uso_tokens (fluxo, modelo, tokens_prompt, tokens_completion, custo_estimado, origem, data_hora)
       VALUES ('conversa_texto', 'gpt-4o-mini', 100, 50, 0.01, 'uso_real', '2026-09-01T10:00:00.000Z')`,
    ).run();

    const tool = criarToolConsultarDadosDinamico(db);
    const resultado = await tool.handler(
      { dominio: 'uso_ia', metrica: 'soma_valor', agrupar_por: ['fluxo'] },
      { chatId: 1 },
    );

    expect(resultado).toContain('conversa_texto: 0.01');
  });

  it('sem dado encontrado, retorna eco + aviso, não erro', async () => {
    const tool = criarToolConsultarDadosDinamico(db);
    const resultado = await tool.handler(
      { dominio: 'financeiro', metrica: 'soma_valor', agrupar_por: ['categoria'], filtros: { categoria: 'Inexistente' } },
      { chatId: 1 },
    );

    expect(resultado).toContain('Nenhum dado encontrado');
  });

  it('métrica saldo em uso_ia (fora da whitelist cruzada) retorna recusa, não estoura erro', async () => {
    const tool = criarToolConsultarDadosDinamico(db);
    const resultado = await tool.handler(
      { dominio: 'uso_ia', metrica: 'saldo', agrupar_por: ['fluxo'] },
      { chatId: 1 },
    );

    expect(resultado).toContain('Não consegui calcular isso');
  });

  it('conta_apelido inválido no filtro retorna mensagem de erro, sem estourar', async () => {
    const tool = criarToolConsultarDadosDinamico(db);
    const resultado = await tool.handler(
      {
        dominio: 'financeiro',
        metrica: 'soma_valor',
        agrupar_por: ['categoria'],
        filtros: { conta_apelido: 'Não existe' },
      },
      { chatId: 1 },
    );

    expect(resultado).not.toContain('Interpretação:');
  });

  it('tool não exige confirmação (consulta pura)', () => {
    const tool = criarToolConsultarDadosDinamico(db);
    expect(tool.requerConfirmacao).toBeFalsy();
  });
});
