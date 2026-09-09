-- Fase 6 (parte 6): cache de categorizacao (descricao normalizada -> categoria)
-- ver PLANO.md, "Cache", "Cache de categorizacao". Sem FK para uma tabela
-- categorias formal -- decisao explicita: categoria continua TEXT livre,
-- igual a transacoes.categoria hoje (ver tasks/plan.md, Architecture Decisions).

CREATE TABLE cache_categorizacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao_normalizada TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('ia', 'usuario')),
  modelo_sugeriu TEXT,
  atualizado_em TEXT NOT NULL
);
