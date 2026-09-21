import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gerarPdfTexto } from '../../src/scripts/gerarPdfTeste.js';
import type { DbClient } from '../../src/db/client.js';
import { listarCasosTeste } from '../../src/db/repositories/casosTesteBenchmark.js';
import { migrate } from '../../src/db/migrate.js';
import {
  seedCasosTesteBenchmarkMidiaCurados,
} from '../../src/scripts/seedCasosTesteBenchmarkMidiaCurados.js';

const CHAVE_TESTE = 'chave-teste-seed-casos-midia-curados';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-seed-casos-midia-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('gerarPdfTexto', () => {
  it('gera um PDF válido (cabeçalho/rodapé corretos) com o conteúdo de texto embutido', () => {
    const pdf = gerarPdfTexto(['Linha um', 'Linha dois']);

    expect(pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(pdf.toString('latin1')).toContain('%%EOF');
    expect(pdf.toString('latin1')).toContain('(Linha um) Tj');
    expect(pdf.toString('latin1')).toContain('(Linha dois) Tj');
  });

  it('escapa parênteses e barra invertida no texto (sintaxe de string PDF)', () => {
    const pdf = gerarPdfTexto(['Valor (aprox.) R$ 10\\20']);

    expect(pdf.toString('latin1')).toContain('\\(aprox.\\)');
    expect(pdf.toString('latin1')).toContain('10\\\\20');
  });
});

describe('seedCasosTesteBenchmarkMidiaCurados', () => {
  it('cria os casos curados de leitura_comprovante numa base vazia, cada um com entradaArquivo (PDF em base64)', async () => {
    const criados = await seedCasosTesteBenchmarkMidiaCurados(db);

    const casos = listarCasosTeste(db, 'leitura_comprovante');
    expect(casos.length).toBeGreaterThanOrEqual(2);
    expect(casos.every((caso) => caso.origem === 'curado')).toBe(true);
    expect(casos.every((caso) => caso.entradaArquivo?.mimeType === 'application/pdf')).toBe(true);

    const primeiroPdf = Buffer.from(casos[0]!.entradaArquivo!.base64, 'base64');
    expect(primeiroPdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(criados).toBeGreaterThanOrEqual(casos.length);
  });

  it('cria os casos curados de interpretar_planilha numa base vazia, cada um com entradaArquivo (xlsx em base64)', async () => {
    await seedCasosTesteBenchmarkMidiaCurados(db);

    const casos = listarCasosTeste(db, 'interpretar_planilha');
    expect(casos.length).toBeGreaterThanOrEqual(2);
    expect(casos.every((caso) => caso.origem === 'curado')).toBe(true);
    expect(
      casos.every(
        (caso) =>
          caso.entradaArquivo?.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe(true);
    expect(casos.every((caso) => Buffer.from(caso.entradaArquivo!.base64, 'base64').length > 0)).toBe(true);
  });

  it('não duplica ao rodar de novo (idempotente por rótulo)', async () => {
    await seedCasosTesteBenchmarkMidiaCurados(db);

    const criadosSegundaRodada = await seedCasosTesteBenchmarkMidiaCurados(db);

    expect(criadosSegundaRodada).toBe(0);
  });

  it('cada caso curado de leitura_comprovante tem gabarito coerente com o texto do PDF gerado', async () => {
    await seedCasosTesteBenchmarkMidiaCurados(db);

    const casos = listarCasosTeste(db, 'leitura_comprovante');
    const compra = casos.find((c) => c.entrada === 'comprovante compra mercado');
    expect(compra?.saidaEsperada).toMatchObject({ tipoDocumento: 'compra', valor: 45 });

    const fatura = casos.find((c) => c.entrada === 'fatura cartao Nubank');
    expect(fatura?.saidaEsperada).toMatchObject({ tipoDocumento: 'fatura_cartao', valor: 850, identificador: 'Nubank' });
  });

  it('caso de planilha com linha de total inclui só as 2 transações de verdade no gabarito', async () => {
    await seedCasosTesteBenchmarkMidiaCurados(db);

    const casos = listarCasosTeste(db, 'interpretar_planilha');
    const comTotal = casos.find((c) => c.entrada === 'planilha extrato com linha de total a ignorar');
    expect(comTotal?.saidaEsperada).toEqual([
      { tipo: 'despesa', valor: 45, categoria: 'Mercado', data: '2026-09-10' },
      { tipo: 'receita', valor: 1000, categoria: 'Salário', data: '2026-09-05' },
    ]);
  });
});
