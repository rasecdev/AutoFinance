-- Rodada "Lembrete automático de reautorização do Google" (ver PROGRESSO.md,
-- 2026-10-03): fecha o último atrito manual depois da persistência do
-- refresh_token no banco (migration 0018) -- o usuário ainda precisava
-- lembrar de rodar /registrar_email sozinho a cada ~7 dias. Tabela singleton
-- (mesmo princípio de credenciais_google/bot_pausado) guarda só quando foi o
-- último lembrete automático enviado -- desacoplada do estado real do token
-- de propósito (ver tasks/plan.md, Architecture Decisions).
CREATE TABLE lembrete_reautorizacao_google (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enviado_em TEXT NOT NULL
);
