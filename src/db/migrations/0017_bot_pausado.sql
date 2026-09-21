-- Achado real (revisao OWASP Top 10 for Agentic Applications, ASI10 -- Rogue
-- Agents, PLANO.md): hoje o unico "kill switch" do bot e revogar o token no
-- BotFather -- manual, fora do sistema, sem registro. Esta tabela guarda um
-- kill switch simples por chat_id: presenca de linha significa "pausado",
-- mesmo principio ja usado em confirmacoes_pendentes/emails_processados.
-- Pausa e por chat_id (nao global) porque a allowlist ja suporta multiplos
-- chats e Producao/Homologacao sao bots/chats totalmente separados -- pausar
-- Homologacao nunca deve afetar Producao sem querer.
CREATE TABLE bot_pausado (
  chat_id INTEGER PRIMARY KEY,
  pausado_em TEXT NOT NULL
);
