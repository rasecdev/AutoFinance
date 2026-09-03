-- Fase 6 (parte 2): conjunto de teste do "Benchmark interno" — curado
-- manualmente (ou derivado de uma interação já avaliada como correta),
-- cresce aos poucos. Nasce vazia, mesmo padrão de outras tabelas de
-- curadoria do projeto (roteamento_tarefas, modelos_referencia_comparacao).

CREATE TABLE casos_teste_benchmark (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fluxo TEXT NOT NULL,
  entrada TEXT NOT NULL,
  saida_esperada TEXT NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('curado', 'derivado_correcao')),
  criado_em TEXT NOT NULL
);
