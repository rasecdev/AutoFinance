import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { criarCartao } from '../../src/db/repositories/cartoes.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import {
  encontrarFaturaCorrespondente,
  encontrarParcelaCorrespondente,
} from '../../src/db/repositories/correspondenciaFaturaParcela.js';
import { criarDivida } from '../../src/db/repositories/dividas.js';
import { migrate } from '../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-correspondencia';

let dir: string;
let db: DbClient;
let contaId: number;
let cartaoId: number;
let dividaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-correspondencia-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' }).id;
  cartaoId = criarCartao(db, { contaId, nome: 'Nubank Cartão', limite: 5000, diaFechamento: 5, diaVencimento: 10 })
    .id;
  // 4 parcelas de 300, vencendo em 2026-10-01, 11-01, 12-01, 2027-01-01
  dividaId = criarDivida(db, {
    contaId,
    tipo: 'emprestimo',
    valorTotal: 1200,
    numParcelas: 4,
    dataInicio: '2026-09-01',
  }).divida.id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function inserirFatura(mesReferencia: string, valor = 1000): void {
  db.prepare("INSERT INTO faturas (cartao_id, mes_referencia, valor, status) VALUES (?, ?, ?, 'aberta')").run(
    cartaoId,
    mesReferencia,
    valor,
  );
}

describe('encontrarFaturaCorrespondente', () => {
  it('encontra fatura existente pelo par cartao_id + mes_referencia', () => {
    inserirFatura('2026-09', 850);

    const fatura = encontrarFaturaCorrespondente(db, { cartaoId, mesReferencia: '2026-09' });

    expect(fatura?.valor).toBe(850);
  });

  it('retorna undefined sem lançar erro quando não há fatura correspondente', () => {
    expect(encontrarFaturaCorrespondente(db, { cartaoId, mesReferencia: '2026-12' })).toBeUndefined();
  });
});

describe('encontrarParcelaCorrespondente', () => {
  it('com número informado e batendo, encontra por número (ignora aproximação)', () => {
    const resultado = encontrarParcelaCorrespondente(db, {
      dividaId,
      numeroParcela: 2,
      valor: 999999, // bem fora da tolerância — não deveria importar, é busca exata por número
      dataVencimento: '2099-01-01',
    });

    expect(resultado.tipo).toBe('encontrada');
    if (resultado.tipo === 'encontrada') {
      expect(resultado.parcela.numeroParcela).toBe(2);
    }
  });

  it('com número informado e não existente, não encontrada', () => {
    const resultado = encontrarParcelaCorrespondente(db, {
      dividaId,
      numeroParcela: 99,
      valor: 300,
      dataVencimento: '2026-11-01',
    });

    expect(resultado.tipo).toBe('nao_encontrada');
  });

  it('sem número, valor e data dentro da tolerância com uma única candidata, encontra por aproximação', () => {
    const resultado = encontrarParcelaCorrespondente(db, {
      dividaId,
      valor: 301, // dentro de 1% de 300
      dataVencimento: '2026-11-02', // dentro de 5 dias de 2026-11-01 (parcela 2)
    });

    expect(resultado.tipo).toBe('encontrada');
    if (resultado.tipo === 'encontrada') {
      expect(resultado.parcela.numeroParcela).toBe(2);
    }
  });

  it('sem número e nenhuma candidata dentro da tolerância, não encontrada', () => {
    const resultado = encontrarParcelaCorrespondente(db, {
      dividaId,
      valor: 500,
      dataVencimento: '2026-11-01',
    });

    expect(resultado.tipo).toBe('nao_encontrada');
  });

  it('sem número e mais de uma candidata dentro da tolerância, ambígua — não resolve sozinho', () => {
    // As parcelas geradas por criarDivida ficam 1 mês (~30 dias) separadas —
    // fora da janela de 5 dias sozinhas. Insere uma parcela extra bem
    // próxima (2 dias) da parcela 2 (2026-11-01, valor 300) pra forçar duas
    // candidatas reais dentro da tolerância.
    db.prepare(
      "INSERT INTO parcelas (divida_id, numero_parcela, valor, data_vencimento) VALUES (?, 5, 301, '2026-11-03')",
    ).run(dividaId);

    const resultado = encontrarParcelaCorrespondente(db, {
      dividaId,
      valor: 300,
      dataVencimento: '2026-11-01',
    });

    expect(resultado.tipo).toBe('ambigua');
    if (resultado.tipo === 'ambigua') {
      expect(resultado.candidatas.length).toBe(2);
    }
  });
});
