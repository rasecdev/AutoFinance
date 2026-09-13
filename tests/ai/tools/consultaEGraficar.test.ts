import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarToolConsultarEGraficar } from '../../../src/ai/tools/consultaEGraficar.js';
import type { DbClient } from '../../../src/db/client.js';
import { criarConta } from '../../../src/db/repositories/contas.js';
import { criarTransacao } from '../../../src/db/repositories/transacoes.js';
import { migrate } from '../../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-tool-consulta-e-graficar';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-tool-consulta-e-graficar-test-'));
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

describe('tool consultar_e_graficar', () => {
  it('chamada única retorna texto (com eco) + imagem, sem round-trip extra', async () => {
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 100, categoria: 'Mercado', data: '2026-09-01' });
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 300, categoria: 'Transporte', data: '2026-09-02' });

    const tool = criarToolConsultarEGraficar(db);
    const resultado = await tool.handler(
      {
        dominio: 'financeiro',
        metrica: 'soma_valor',
        agrupar_por: ['categoria'],
        tipo_grafico: 'barra',
      },
      { chatId: 1 },
    );

    if (typeof resultado === 'string') throw new Error('esperava objeto {texto, imagem}');
    expect(resultado.texto).toContain('Interpretação:');
    expect(resultado.texto).toContain('Transporte: 300.00');
    expect(resultado.imagem?.subarray(0, 4)).toEqual(PNG_MAGIC);
  });

  it('mesmas validações de whitelist de consultar_dados_dinamico aplicadas aqui', async () => {
    const tool = criarToolConsultarEGraficar(db);
    const resultado = await tool.handler(
      { dominio: 'uso_ia', metrica: 'saldo', agrupar_por: ['fluxo'], tipo_grafico: 'barra' },
      { chatId: 1 },
    );

    expect(resultado).toContain('Não consegui calcular isso');
  });

  it('tipo_grafico fora do enum é recusado pelo schema', () => {
    const tool = criarToolConsultarEGraficar(db);
    const validacao = tool.schema.safeParse({
      dominio: 'financeiro',
      metrica: 'soma_valor',
      agrupar_por: ['categoria'],
      tipo_grafico: 'rosca',
    });

    expect(validacao.success).toBe(false);
  });

  it('sem dado encontrado, retorna eco + aviso em texto puro, sem gerar imagem', async () => {
    const tool = criarToolConsultarEGraficar(db);
    const resultado = await tool.handler(
      {
        dominio: 'financeiro',
        metrica: 'soma_valor',
        agrupar_por: ['categoria'],
        filtros: { categoria: 'Inexistente' },
        tipo_grafico: 'barra',
      },
      { chatId: 1 },
    );

    expect(typeof resultado).toBe('string');
    expect(resultado as string).toContain('Nenhum dado encontrado');
  });

  it('tool não exige confirmação (consulta pura)', () => {
    const tool = criarToolConsultarEGraficar(db);
    expect(tool.requerConfirmacao).toBeFalsy();
  });
});
