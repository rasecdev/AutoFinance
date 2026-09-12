import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../src/db/client.js';
import { criarCartao } from '../../src/db/repositories/cartoes.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { criarDespesaFixa } from '../../src/db/repositories/despesasFixas.js';
import { migrate } from '../../src/db/migrate.js';
import {
  calcularDataVencimentoFatura,
  calcularProximaOcorrenciaMensal,
  projetarFluxoCaixa,
} from '../../src/relatorios/fluxoCaixa.js';

const CHAVE_TESTE = 'chave-teste-fluxo-caixa';

let dir: string;
let db: DbClient;
let contaId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-fluxo-caixa-test-'));
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

function paraISODate(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function daquiA(dias: number): { data: Date; iso: string } {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  return { data, iso: paraISODate(data) };
}

function inserirDividaComParcela(valorParcela: number, dataVencimento: string): void {
  const dividaId = db
    .prepare(
      "INSERT INTO dividas (conta_id, tipo, valor_total, num_parcelas, valor_parcela, data_inicio) VALUES (?, 'emprestimo', ?, 1, ?, '2026-01-01')",
    )
    .run(contaId, valorParcela, valorParcela).lastInsertRowid;
  db.prepare('INSERT INTO parcelas (divida_id, numero_parcela, valor, data_vencimento) VALUES (?, 1, ?, ?)').run(
    dividaId,
    valorParcela,
    dataVencimento,
  );
}

describe('calcularDataVencimentoFatura', () => {
  it('constrói a data a partir de mes_referencia + dia_vencimento', () => {
    expect(calcularDataVencimentoFatura('2026-09', 10)).toBe('2026-09-10');
  });
});

describe('calcularProximaOcorrenciaMensal', () => {
  it('retorna este mês quando o dia ainda não passou', () => {
    const apartirDe = new Date(2026, 8, 5); // 2026-09-05
    expect(calcularProximaOcorrenciaMensal(20, apartirDe)).toBe('2026-09-20');
  });

  it('retorna o mês seguinte quando o dia já passou', () => {
    const apartirDe = new Date(2026, 8, 25); // 2026-09-25
    expect(calcularProximaOcorrenciaMensal(20, apartirDe)).toBe('2026-10-20');
  });

  it('considera hoje como ocorrência válida', () => {
    const apartirDe = new Date(2026, 8, 20);
    expect(calcularProximaOcorrenciaMensal(20, apartirDe)).toBe('2026-09-20');
  });
});

describe('projetarFluxoCaixa', () => {
  it('retorna só o saldo atual quando não há nenhum evento agendado', () => {
    const resultado = projetarFluxoCaixa(db, 30, contaId);

    expect(resultado).toEqual({ saldoAtual: 1000, saldoProjetado: 1000, eventos: [], dataFicaNegativo: null });
  });

  it('inclui parcela pendente dentro da janela e exclui fora da janela', () => {
    const dentro = daquiA(5);
    const fora = daquiA(40);
    inserirDividaComParcela(200, dentro.iso);
    inserirDividaComParcela(300, fora.iso);

    const resultado = projetarFluxoCaixa(db, 30, contaId);

    expect(resultado.eventos).toHaveLength(1);
    expect(resultado.eventos[0]?.valor).toBe(200);
    expect(resultado.saldoProjetado).toBe(800);
  });

  it('inclui fatura aberta dentro da janela, com data calculada via mes_referencia + dia_vencimento do cartão', () => {
    // Data alvo derivada de "hoje + 15 dias" (nunca uma constante fixa, pra não
    // depender de em que dia do mês o teste roda) — dia_vencimento do cartão
    // vira o dia dessa data alvo, garantindo que calcularDataVencimentoFatura
    // reproduza exatamente essa data, dentro da janela de 60 dias testada.
    const alvo = daquiA(15).data;
    const cartaoId = criarCartao(db, {
      contaId,
      nome: 'Cartão',
      limite: 5000,
      diaFechamento: 5,
      diaVencimento: alvo.getDate(),
    }).id;
    const mesReferencia = `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}`;
    db.prepare("INSERT INTO faturas (cartao_id, mes_referencia, valor, status) VALUES (?, ?, 500, 'aberta')").run(
      cartaoId,
      mesReferencia,
    );

    const resultado = projetarFluxoCaixa(db, 60, contaId);

    expect(resultado.eventos.some((evento) => evento.valor === 500)).toBe(true);
  });

  it('inclui despesa fixa ativa sem cartão dentro da janela, mas exclui despesa fixa vinculada a cartão', () => {
    const hoje = new Date();
    const diaFuturo = ((hoje.getDate() + 5) % 28) + 1;
    criarDespesaFixa(db, {
      contaId,
      descricao: 'Aluguel',
      categoria: 'Moradia',
      valorEsperado: 400,
      diaVencimentoEsperado: diaFuturo,
      criadoEm: new Date().toISOString(),
    });

    const cartaoId = criarCartao(db, { contaId, nome: 'Cartão', limite: 5000, diaFechamento: 5, diaVencimento: 10 }).id;
    criarDespesaFixa(db, {
      contaId,
      cartaoId,
      descricao: 'Streaming',
      categoria: 'Assinatura',
      valorEsperado: 50,
      diaVencimentoEsperado: diaFuturo,
      criadoEm: new Date().toISOString(),
    });

    const resultado = projetarFluxoCaixa(db, 45, contaId);

    expect(resultado.eventos.some((evento) => evento.descricao === 'Aluguel')).toBe(true);
    expect(resultado.eventos.some((evento) => evento.descricao === 'Streaming')).toBe(false);
  });

  it('marca dataFicaNegativo na data do evento que faz o saldo acumulado cruzar zero', () => {
    const primeiro = daquiA(3);
    const segundo = daquiA(10);
    inserirDividaComParcela(600, primeiro.iso);
    inserirDividaComParcela(500, segundo.iso);

    const resultado = projetarFluxoCaixa(db, 30, contaId);

    expect(resultado.dataFicaNegativo).toBe(segundo.iso);
  });

  it('sem contaId, soma saldo de todas as contas juntos', () => {
    criarConta(db, { bancoNome: 'Itaú', tipo: 'PJ', apelido: 'PJ', saldoInicial: 500 });

    const resultado = projetarFluxoCaixa(db, 30);

    expect(resultado.saldoAtual).toBe(1500);
  });
});
