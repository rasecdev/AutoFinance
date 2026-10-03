-- mensagens_pendentes_apagar (migration 0013) existia só pra sobreviver a um
-- restart do bot antes do setTimeout de auto-apagar a mensagem com o
-- refresh_token do Google (/registrar_email) disparar. Com a persistência do
-- refresh_token direto no banco (migration 0018, credenciais_google), o token
-- deixou de ser exibido em texto no chat -- nada mais usa este mecanismo
-- (confirmado por grep antes de remover). Migration antiga 0013 nunca é
-- editada/apagada, só superada por esta.
DROP TABLE mensagens_pendentes_apagar;
