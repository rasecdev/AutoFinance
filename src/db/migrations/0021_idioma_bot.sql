-- Fase 10 (Regionalização i18n PT/EN/ES, ver PLANO.md e tasks/plan.md): idioma
-- ativo único, global por instância (Produção/Homologação já isoladas por
-- ambiente, sem necessidade real de granularidade por chat_id -- decisão
-- consciente, diferente do padrão por-chat de bot_pausado/migration 0017).
-- Tabela singleton, mesmo princípio de lembrete_reautorizacao_google/
-- credenciais_google. Sem linha ainda = 'pt' (comportamento atual, ver
-- repositório).
CREATE TABLE idioma_bot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  idioma TEXT NOT NULL
);
