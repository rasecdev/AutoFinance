-- Achado do usuário na Tarefa 10 (renegociar): dívida não tinha nenhum campo
-- de referência por nome, só id — quebrava o "Princípio de referência por
-- apelido/contexto" (nunca pedir/expor id bruto ao usuário). Diferente de
-- contas/cartões, dívida é identificada por conta + tipo (pode haver mais de
-- uma do mesmo tipo na mesma conta); descricao é opcional, usada só pra
-- desambiguar quando existir mais de uma dívida do mesmo tipo na conta.

ALTER TABLE dividas ADD COLUMN descricao TEXT;
