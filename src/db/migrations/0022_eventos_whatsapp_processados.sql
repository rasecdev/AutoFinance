-- Fase 9 Rodada 2 (Tarefa 131): o webhook da WAHA (Tarefa 132) pode reentregar
-- o mesmo evento em caso de falha/retry -- mesmo principio de idempotencia ja
-- usado em emails_processados (Fase 7) e transacoes_open_finance_processadas
-- (Fase 8), aqui pelo id do evento que a WAHA manda no payload do webhook.
CREATE TABLE eventos_whatsapp_processados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id TEXT NOT NULL UNIQUE,
  processado_em TEXT NOT NULL
);
