-- Fase 6 (parte 8): historico das analises geradas por analisar_qualidade(periodo)
-- ver PLANO.md, linha 786. So log auditavel -- nao e lido de volta pela
-- propria tool nesta rodada (comparacao com periodo anterior usa dupla
-- agregacao, nao leitura do historico salvo -- ver tasks/plan.md, Architecture Decisions).

CREATE TABLE analises_qualidade (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo TEXT NOT NULL,
  conteudo_gerado TEXT NOT NULL,
  data_hora TEXT NOT NULL
);
