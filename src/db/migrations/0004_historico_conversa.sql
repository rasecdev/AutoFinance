-- Fase 4 (Tarefa 17): memória de conversa precisa reconstruir "últimos N
-- turnos de um chat" a partir de interacoes_ia, mas a tabela não sabia a
-- qual chat cada interação pertencia, nem quantos tokens cada uma consumiu
-- (uso_tokens grava por fluxo/modelo agregado, sem trace_id/chat_id, então
-- não dá pra somar tokens "desde o último resumo" de um chat específico a
-- partir dela). Colunas novas ficam NULL em linhas antigas (Fase 3) — a
-- memória de conversa só precisa funcionar a partir de quando existirem.

ALTER TABLE interacoes_ia ADD COLUMN chat_id INTEGER;
ALTER TABLE interacoes_ia ADD COLUMN tokens_prompt INTEGER;
ALTER TABLE interacoes_ia ADD COLUMN tokens_completion INTEGER;

CREATE TABLE resumos_conversa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  resumo_texto TEXT NOT NULL,
  cobre_ate_trace_id TEXT NOT NULL,
  tokens_janela_no_gatilho INTEGER NOT NULL,
  criado_em TEXT NOT NULL
);
