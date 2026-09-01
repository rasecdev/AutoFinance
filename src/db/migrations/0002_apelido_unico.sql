-- Achado do usuário testando a Tarefa 5.1 (resolução por apelido): sem
-- unicidade, apelido de conta/nome de cartão vira ambíguo com facilidade.
-- Ver "Princípio de referência por apelido/contexto" no PLANO.md.

CREATE UNIQUE INDEX idx_contas_apelido_unico ON contas (apelido);

-- Cartão é único por conta (duas contas diferentes podem ter cartões
-- com o mesmo nome, já que você normalmente já especifica a conta antes).
CREATE UNIQUE INDEX idx_cartoes_conta_nome_unico ON cartoes (conta_id, nome);
