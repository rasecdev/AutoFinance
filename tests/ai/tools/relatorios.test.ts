import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function criarClienteFalso(resumoTexto = 'resumo gerado') {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: resumoTexto } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 },
  });
  return { chat: { completions: { create } } } as unknown as OpenAI;
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
  it('periodo=dia: retorna relatório do dia vazio quando não há nada registrado', async () => {
    const tool = criarToolRelatorio(criarClienteFalso(), db);

    const resultado = await tool.handler({ periodo: 'dia' }, { chatId: 1 });

    expect(resultado).toContain(hojeISO());
    expect(resultado).toContain('Nenhuma transação no período.');
    expect(resultado).toContain('Nenhum uso de IA registrado no período.');
  });

  it('periodo=dia: inclui transação registrada hoje no relatório', async () => {
    const contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal', saldoInicial: 100 }).id;
    criarTransacao(db, { contaId, tipo: 'despesa', valor: 30, categoria: 'transporte', data: hojeISO() });
    const tool = criarToolRelatorio(criarClienteFalso(), db);

    const resultado = await tool.handler({ periodo: 'dia' }, { chatId: 1 });

    expect(resultado).toContain('transporte');
    expect(resultado).toContain('R$ 30.00');
  });

  it('periodo=dia: inclui uso de IA registrado hoje no relatório', async () => {
    registrarUsoTokens(db, {
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      tokensPrompt: 100,
      tokensCompletion: 20,
      custoEstimado: 0.01,
      origem: 'uso_real',
    });
    const tool = criarToolRelatorio(criarClienteFalso(), db);

    const resultado = await tool.handler({ periodo: 'dia' }, { chatId: 1 });

    expect(resultado).toContain('conversa_texto');
    expect(resultado).toContain('120 tokens');
  });

  it('periodo=semana: devolve a imagem-resumo em vez de texto completo', async () => {
    const tool = criarToolRelatorio(criarClienteFalso(), db);

    const resultado = await tool.handler({ periodo: 'semana' }, { chatId: 1 });

    expect(typeof resultado).toBe('object');
    const objeto = resultado as { texto: string; imagem?: Buffer };
    expect(objeto.imagem).toBeInstanceOf(Buffer);
    expect(objeto.imagem?.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); // assinatura PNG
  });

  it('periodo=mes: devolve o PDF completo em vez de texto completo', async () => {
    const tool = criarToolRelatorio(criarClienteFalso(), db);

    const resultado = await tool.handler({ periodo: 'mes' }, { chatId: 1 });

    expect(typeof resultado).toBe('object');
    const objeto = resultado as { texto: string; documento?: { buffer: Buffer; nomeArquivo: string } };
    expect(objeto.documento?.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(objeto.documento?.nomeArquivo).toMatch(/^relatorio-mensal-\d{4}-\d{2}\.pdf$/);
  });
});
