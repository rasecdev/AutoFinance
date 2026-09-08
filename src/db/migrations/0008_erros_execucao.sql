-- Fase 6 (parte 5): erro tecnico de job em background (nao de conversa
-- pontual) -- ver PLANO.md, "Logs e tratamento de erros", item 3.
-- trace_id fica nulo quando o erro nao veio de uma interacao (ex: job
-- agendado sem chat_id associado). Nasce vazia.

CREATE TABLE erros_execucao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id TEXT,
  contexto TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  detalhes TEXT,
  data_hora TEXT NOT NULL,
  resolvido INTEGER NOT NULL DEFAULT 0
);
