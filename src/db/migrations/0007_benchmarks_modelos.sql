-- Fase 6 (parte 2): resultado de benchmark (externo, pesquisado manualmente,
-- ou interno, via execução real contra caso_teste_benchmark) por fluxo e
-- modelo — fonte_url = "interno" identifica resultado gerado pelo motor do
-- projeto; qualquer outro valor é curadoria manual de benchmark de terceiro.
-- Nasce vazia.

CREATE TABLE benchmarks_modelos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fluxo TEXT NOT NULL,
  model_id_openrouter TEXT NOT NULL,
  metrica TEXT NOT NULL,
  valor REAL NOT NULL,
  fonte_url TEXT NOT NULL,
  data_pesquisa TEXT NOT NULL
);
