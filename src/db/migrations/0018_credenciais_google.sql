-- Achado real (invalid_grant em ler_email_faturas/sincronizar_calendario,
-- 2026-10-01/02, ver PROGRESSO.md): o refresh_token do Google vivia em
-- GOOGLE_REFRESH_TOKEN no .env.*, exigindo SSH na VM + editar .env + reiniciar
-- os jobs a cada reautorização (app OAuth em status Testing expira o token a
-- cada ~7 dias). Tabela singleton (mesmo princípio de bot_pausado) guarda o
-- valor atual, pra /registrar_email persistir direto e os jobs lerem sozinhos.
--
-- ATENÇÃO — NUNCA incluir esta tabela em consultar_dados_dinamico/
-- consultar_e_graficar (src/ai/tools/consultaDinamica.ts e
-- src/relatorios/consultaDinamica.ts): essas tools deixam o modelo de IA
-- escolher dimensão/filtro por linguagem natural, e vazar este valor ali daria
-- acesso de leitura ao Gmail/Calendar pra quem formular a pergunta certa.
CREATE TABLE credenciais_google (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_token TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
