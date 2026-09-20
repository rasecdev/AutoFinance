-- Fase 8 (Open Finance / Pluggy), Tarefa 98 — ver tasks/plan.md e tasks/todo.md.

-- Mapeamento entre conta/cartão do Pluggy e conta/cartão já cadastrado no
-- AutoFinance (nunca automático por nome — ver /registrar_open_finance,
-- Tarefa 101). Um item pode trazer várias contas; cada uma vira uma linha.
CREATE TABLE contas_open_finance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pluggy_item_id TEXT NOT NULL,
  pluggy_account_id TEXT NOT NULL UNIQUE,
  conta_id INTEGER REFERENCES contas(id),
  cartao_id INTEGER REFERENCES cartoes(id),
  criado_em TEXT NOT NULL,
  CHECK ((conta_id IS NOT NULL) OR (cartao_id IS NOT NULL))
);

-- Idempotência do job de sincronização (sincronizarOpenFinance.ts, Tarefa
-- 103) — mesmo papel de emails_processados (migration 0011), mas sem
-- pendência de confirmação: o resultado é sempre imediato (correspondência
-- resolvida ou transação criada direto, nunca fica esperando resposta).
CREATE TABLE transacoes_open_finance_processadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pluggy_transaction_id TEXT NOT NULL UNIQUE,
  processado_em TEXT NOT NULL,
  resultado TEXT NOT NULL CHECK (
    resultado IN ('transacao_criada', 'correspondencia_manual', 'correspondencia_fatura_parcela', 'saque_ignorado')
  )
);

-- transacoes nunca teve origem/trace_id (só parcelas tinha, desde a Fase 1)
-- — necessário agora pra identificar/filtrar transação vinda do Open
-- Finance depois (relatórios, correção de erro de correspondência), mesmo
-- padrão de parcelas.origem/trace_id.
ALTER TABLE transacoes ADD COLUMN origem TEXT NOT NULL CHECK (origem IN ('manual', 'open_finance')) DEFAULT 'manual';
ALTER TABLE transacoes ADD COLUMN trace_id TEXT;
