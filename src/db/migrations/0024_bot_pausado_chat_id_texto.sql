-- Achado real (Tarefa 139, Fase 9 Rodada 3): `chat_id INTEGER PRIMARY KEY`
-- é um alias de rowid no SQLite -- caso especial que EXIGE um inteiro de
-- verdade, ignorando a conversão de afinidade normal que o resto do projeto
-- já contava (Tarefa 129: "nenhuma tabela usa STRICT, qualquer tipo em
-- qualquer coluna"). Mesmo bug já corrigido em `confirmacoes_pendentes`
-- (migration 0023) -- gravar uma pausa com chatId do WhatsApp (string
-- "<numero>@c.us"/"<lid>@lid") nesta tabela lançaria "SqliteError: datatype
-- mismatch". TEXT PRIMARY KEY (índice único comum, não rowid alias) aceita
-- os dois formatos pela afinidade normal: inteiro do Telegram é convertido
-- pra texto no INSERT e de volta na comparação do SELECT, sem mudar nada do
-- lado do Telegram (mesmo comportamento observável de antes, só sem o caso
-- especial de rowid).
CREATE TABLE bot_pausado_novo (
  chat_id TEXT PRIMARY KEY,
  pausado_em TEXT NOT NULL
);

INSERT INTO bot_pausado_novo (chat_id, pausado_em)
SELECT chat_id, pausado_em FROM bot_pausado;

DROP TABLE bot_pausado;

ALTER TABLE bot_pausado_novo RENAME TO bot_pausado;
