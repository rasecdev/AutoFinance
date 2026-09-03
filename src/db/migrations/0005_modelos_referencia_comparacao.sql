-- Fase 6 (Tarefa 27): Métrica 1 do relatório (comparação token-a-token de
-- custo hipotético contra alguns modelos "famosos") precisa de uma lista
-- curta e curada de modelos de referência — nasce vazia, mesmo padrão de
-- roteamento_tarefas (Fase 5): sem linha, a Métrica 1 simplesmente não
-- aparece no relatório, sem quebrar nada.

CREATE TABLE modelos_referencia_comparacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_exibicao TEXT NOT NULL,
  model_id_openrouter TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1
);
