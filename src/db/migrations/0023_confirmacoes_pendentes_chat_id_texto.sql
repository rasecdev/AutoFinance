-- Achado real (Tarefa 135, Fase 9 Rodada 2): `chat_id INTEGER PRIMARY KEY`
-- é um alias de rowid no SQLite — caso especial que EXIGE um inteiro de
-- verdade, ignorando a conversão de afinidade normal que o resto do projeto
-- já contava (Tarefa 129: "nenhuma tabela usa STRICT, qualquer tipo em
-- qualquer coluna"). Gravar uma pendência com chatId do WhatsApp (string
-- "<numero>@c.us") nesta tabela lançava "SqliteError: datatype mismatch".
-- TEXT PRIMARY KEY (índice único comum, não rowid alias) aceita os dois
-- formatos pela afinidade normal: inteiro do Telegram é convertido pra texto
-- no INSERT e de volta na comparação do SELECT, sem mudar nada do lado do
-- Telegram (mesmo comportamento observável de antes, só sem o caso especial
-- de rowid).
CREATE TABLE confirmacoes_pendentes_novo (
  chat_id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  argumentos TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

INSERT INTO confirmacoes_pendentes_novo (chat_id, tool_name, argumentos, criado_em)
SELECT chat_id, tool_name, argumentos, criado_em FROM confirmacoes_pendentes;

DROP TABLE confirmacoes_pendentes;

ALTER TABLE confirmacoes_pendentes_novo RENAME TO confirmacoes_pendentes;
