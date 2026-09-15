-- Fase 7 (Tarefa 89): schema de apoio a integracao com Gmail e Google Calendar.
-- ver PLANO.md linhas 578-613 e tasks/plan.md (Architecture Decisions).

-- Idempotencia do job de leitura de e-mail: cada mensagem do Gmail e processada
-- no maximo uma vez, mesmo que o job seja reiniciado ou rode em paralelo.
CREATE TABLE emails_processados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gmail_message_id TEXT NOT NULL UNIQUE,
  processado_em TEXT NOT NULL,
  resultado TEXT NOT NULL CHECK (
    resultado IN (
      'fatura_registrada',
      'parcela_registrada',
      'pendente_confirmacao',
      'sem_correspondencia',
      'ignorado_nao_e_fatura'
    )
  )
);

-- Vincula fatura/parcela ao evento criado no Google Calendar, para permitir
-- atualizar ou remover o evento sem duplicar (ver job sincronizarCalendario).
ALTER TABLE faturas ADD COLUMN evento_calendario_id TEXT;
ALTER TABLE parcelas ADD COLUMN evento_calendario_id TEXT;
