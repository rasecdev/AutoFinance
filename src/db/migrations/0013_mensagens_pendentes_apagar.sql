-- Achado real (2026-09-19, teste manual em Homologacao): a mensagem do
-- /registrar_email com o refresh_token do Google prometia se auto-apagar em
-- 5 minutos (setTimeout em memoria do processo do bot), mas o bot foi
-- reiniciado (deploy de outra correcao) antes do timer disparar -- o
-- agendamento foi perdido de vez, sem nenhuma tentativa de recuperar depois
-- do restart. Mesma classe de bug da migration 0012 (estado sensivel preso
-- so na memoria do processo). Esta tabela guarda o agendamento de verdade;
-- ao subir, o bot varre por atrasados e apaga o que sobrou, cobrindo o caso
-- de restart antes do tempo passar.
CREATE TABLE mensagens_pendentes_apagar (
  chat_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  apagar_em TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  PRIMARY KEY (chat_id, message_id)
);
