import { loadEnv } from '../src/config/env.js';
import { getDb } from '../src/db/client.js';
import { migrate } from '../src/db/migrate.js';

const env = loadEnv();

if (env.ambiente !== 'homologacao') {
  throw new Error(
    `Seed só pode rodar contra Homologação — AMBIENTE atual é "${env.ambiente}". Abortando.`,
  );
}

const db = getDb(env);
migrate(db);

const bancoId = db.prepare('INSERT INTO bancos (nome) VALUES (?)').run('Banco Fictício')
  .lastInsertRowid;

const contaPfId = db
  .prepare('INSERT INTO contas (banco_id, tipo, apelido, saldo_atual) VALUES (?, ?, ?, ?)')
  .run(bancoId, 'PF', 'Conta Pessoal', 2500).lastInsertRowid;

const contaPjId = db
  .prepare('INSERT INTO contas (banco_id, tipo, apelido, saldo_atual) VALUES (?, ?, ?, ?)')
  .run(bancoId, 'PJ', 'Conta PJ - Autônomo', 8000).lastInsertRowid;

const cartaoId = db
  .prepare(
    'INSERT INTO cartoes (conta_id, nome, limite, dia_fechamento, dia_vencimento) VALUES (?, ?, ?, ?, ?)',
  )
  .run(contaPfId, 'Cartão Fictício', 5000, 20, 28).lastInsertRowid;

db.prepare('INSERT INTO faturas (cartao_id, mes_referencia, valor, status) VALUES (?, ?, ?, ?)').run(
  cartaoId,
  '2026-08',
  1200,
  'aberta',
);

const dividaOriginalId = db
  .prepare(
    `INSERT INTO dividas
      (conta_id, tipo, valor_total, num_parcelas, valor_parcela, parcelas_pagas, taxa_juros, sistema_amortizacao, indexador, data_inicio, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  .run(contaPfId, 'emprestimo', 10000, 12, 900, 3, 1.5, 'price', 'fixo', '2026-01-01', 'renegociado')
  .lastInsertRowid;

const dividaNovaId = db
  .prepare(
    `INSERT INTO dividas
      (conta_id, tipo, valor_total, num_parcelas, valor_parcela, parcelas_pagas, taxa_juros, sistema_amortizacao, indexador, data_inicio, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  .run(contaPfId, 'emprestimo', 9000, 18, 550, 0, 1.2, 'price', 'fixo', '2026-06-01', 'ativo')
  .lastInsertRowid;

db.prepare(
  `INSERT INTO renegociacoes (divida_origem_tipo, divida_origem_id, nova_divida_id, motivo, data)
   VALUES (?, ?, ?, ?, ?)`,
).run('divida', dividaOriginalId, dividaNovaId, 'Renegociação de taxa de juros', '2026-06-01');

db.prepare(
  'INSERT INTO transacoes (conta_id, tipo, valor, categoria, descricao, data) VALUES (?, ?, ?, ?, ?, ?)',
).run(contaPjId, 'receita', 4500, 'Serviços prestados', 'Pagamento de cliente', '2026-08-05');

db.prepare(
  'INSERT INTO transacoes (conta_id, tipo, valor, categoria, descricao, data) VALUES (?, ?, ?, ?, ?, ?)',
).run(contaPfId, 'despesa', 89.9, 'Alimentação', 'Supermercado', '2026-08-15');

db.prepare(
  'INSERT INTO transacoes (cartao_id, tipo, valor, categoria, descricao, data) VALUES (?, ?, ?, ?, ?, ?)',
).run(cartaoId, 'despesa', 45, 'Transporte', 'Uber', '2026-08-20');

console.log('Seed de Homologação aplicado com sucesso.');
