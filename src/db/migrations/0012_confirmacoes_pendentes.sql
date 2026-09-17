-- Achado real (2026-09-17, teste manual em Homologacao): o mecanismo de
-- confirmacao (src/bot/confirmacao.ts) guarda a pendencia em memoria do
-- PROCESSO -- funciona bem quando quem grava a pendencia e quem le a
-- resposta do usuario sao o mesmo processo (handlers texto.ts/midia.ts,
-- dentro do bot). O job lerEmailFaturas.ts roda como container/processo
-- SEPARADO do bot (Fase 7) -- a pendencia gravada la nunca chegava no
-- processo que de fato recebe a resposta "sim" do usuario, entao a
-- confirmacao de fatura/parcela por e-mail nunca executava de verdade.
-- Esta tabela e o canal compartilhado entre processos pra esse caso
-- especifico; o mecanismo em memoria continua existindo e sendo usado
-- sem mudanca pros fluxos intra-processo (mais simples, sem round-trip
-- de banco pra cada tool call do dia a dia).
CREATE TABLE confirmacoes_pendentes (
  chat_id INTEGER PRIMARY KEY,
  tool_name TEXT NOT NULL,
  argumentos TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
