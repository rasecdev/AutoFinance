import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { calendar_v3 } from 'googleapis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../src/logging/logger.js';
import { sincronizarCalendario } from '../../src/scripts/sincronizarCalendario.js';
import type { DbClient } from '../../src/db/client.js';
import { criarCartao } from '../../src/db/repositories/cartoes.js';
import { criarConta } from '../../src/db/repositories/contas.js';
import { criarDivida } from '../../src/db/repositories/dividas.js';
import { migrate } from '../../src/db/migrate.js';

const CHAVE_TESTE = 'chave-teste-sincronizar-calendario';
const CALENDAR_ID = 'primary';
const HOJE = new Date('2026-09-15T12:00:00Z');

let dir: string;
let db: DbClient;
let contaId: number;
let cartaoId: number;

const logger = createLogger(undefined, 'fatal');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-sincronizar-calendario-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  contaId = criarConta(db, { bancoNome: 'Nubank', tipo: 'PF', apelido: 'Principal' }).id;
  cartaoId = criarCartao(db, { contaId, nome: 'Nubank Cartão', limite: 5000, diaFechamento: 5, diaVencimento: 25 })
    .id;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function criarCalendarFalso(eventoExistente?: { summary: string; data: string }): {
  calendar: calendar_v3.Calendar;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
} {
  const insert = vi.fn(async () => ({ data: { id: 'evento-novo-1' } }));
  const update = vi.fn(async () => ({ data: {} }));
  const del = vi.fn(async () => ({ data: {} }));
  const get = vi.fn(async () => ({
    data: eventoExistente ? { summary: eventoExistente.summary, start: { date: eventoExistente.data } } : {},
  }));

  return {
    calendar: { events: { insert, update, delete: del, get } } as unknown as calendar_v3.Calendar,
    insert,
    update,
    del,
    get,
  };
}

function inserirFatura(mesReferencia: string, valor: number, status = 'aberta', eventoCalendarioId: string | null = null): number {
  const resultado = db
    .prepare(
      "INSERT INTO faturas (cartao_id, mes_referencia, valor, status, evento_calendario_id) VALUES (?, ?, ?, ?, ?)",
    )
    .run(cartaoId, mesReferencia, valor, status, eventoCalendarioId);
  return Number(resultado.lastInsertRowid);
}

describe('sincronizarCalendario', () => {
  it('fatura aberta sem evento, vencimento dentro da janela: cria evento e persiste o id', async () => {
    inserirFatura('2026-09', 850);
    const { calendar, insert } = criarCalendarFalso();

    await sincronizarCalendario(db, calendar, CALENDAR_ID, logger, HOJE);

    expect(insert).toHaveBeenCalledTimes(1);
    const linha = db.prepare('SELECT evento_calendario_id FROM faturas WHERE mes_referencia = ?').get('2026-09') as {
      evento_calendario_id: string | null;
    };
    expect(linha.evento_calendario_id).toBe('evento-novo-1');
  });

  it('fatura já com evento, sem mudança de valor/data: nenhuma chamada de update é feita', async () => {
    inserirFatura('2026-09', 850, 'aberta', 'evento-existente-1');
    const { calendar, insert, update } = criarCalendarFalso({
      summary: 'Fatura Nubank Cartão — R$ 850.00',
      data: '2026-09-25',
    });

    await sincronizarCalendario(db, calendar, CALENDAR_ID, logger, HOJE);

    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('fatura já com evento, com mudança de valor: chama update com o eventId certo', async () => {
    inserirFatura('2026-09', 999, 'aberta', 'evento-existente-2');
    const { calendar, insert, update } = criarCalendarFalso({
      summary: 'Fatura Nubank Cartão — R$ 850.00',
      data: '2026-09-25',
    });

    await sincronizarCalendario(db, calendar, CALENDAR_ID, logger, HOJE);

    expect(insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0]).toMatchObject({ eventId: 'evento-existente-2' });
  });

  it('fatura com evento que virou paga: remove o evento do Calendar e limpa a coluna', async () => {
    const faturaId = inserirFatura('2026-08', 700, 'paga', 'evento-a-remover');
    const { calendar, del } = criarCalendarFalso();

    await sincronizarCalendario(db, calendar, CALENDAR_ID, logger, HOJE);

    expect(del).toHaveBeenCalledWith({ calendarId: CALENDAR_ID, eventId: 'evento-a-remover' });
    const linha = db.prepare('SELECT evento_calendario_id FROM faturas WHERE id = ?').get(faturaId) as {
      evento_calendario_id: string | null;
    };
    expect(linha.evento_calendario_id).toBeNull();
  });

  it('fatura fora da janela de lookahead: ignorada, nenhuma chamada feita', async () => {
    // Vencimento dia 25, mês de referência bem no futuro (~120 dias à frente de 2026-09-15)
    inserirFatura('2027-01', 900);
    const { calendar, insert, update } = criarCalendarFalso();

    await sincronizarCalendario(db, calendar, CALENDAR_ID, logger, HOJE);

    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('parcela pendente sem evento, dentro da janela: cria evento e persiste o id', async () => {
    criarDivida(db, {
      contaId,
      tipo: 'financiamento',
      valorTotal: 1200,
      numParcelas: 4,
      dataInicio: '2026-09-01',
      descricao: 'Financiamento Moto',
    });
    const { calendar, insert } = criarCalendarFalso();

    await sincronizarCalendario(db, calendar, CALENDAR_ID, logger, HOJE);

    // 1a parcela vence 2026-10-01 (~16 dias à frente) — dentro da janela de 60 dias
    expect(insert).toHaveBeenCalled();
  });
});

// O guard de env.google === null fica em main() (não em sincronizarCalendario,
// que já recebe o client Calendar pronto) — mesma decisão de não testar main()
// diretamente já usada em verificarDespesasFixas.test.ts, coberta por teste
// manual em Homologação (ver tasks/plan.md, Risks).
