-- Schema inicial — ver PLANO.md, seções "Modelo de dados" e
-- "Observabilidade e rastreabilidade de IA" (interacoes_ia).

CREATE TABLE bancos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL
);

CREATE TABLE contas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  banco_id INTEGER NOT NULL REFERENCES bancos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('PF', 'PJ')),
  apelido TEXT NOT NULL,
  saldo_atual REAL NOT NULL DEFAULT 0
);

CREATE TABLE cartoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conta_id INTEGER NOT NULL REFERENCES contas(id),
  nome TEXT NOT NULL,
  limite REAL NOT NULL,
  dia_fechamento INTEGER NOT NULL CHECK (dia_fechamento BETWEEN 1 AND 31),
  dia_vencimento INTEGER NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31)
);

CREATE TABLE faturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cartao_id INTEGER NOT NULL REFERENCES cartoes(id),
  mes_referencia TEXT NOT NULL,
  valor REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('aberta', 'paga', 'renegociada')) DEFAULT 'aberta',
  data_pagamento TEXT
);

CREATE TABLE transacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conta_id INTEGER REFERENCES contas(id),
  cartao_id INTEGER REFERENCES cartoes(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  valor REAL NOT NULL,
  categoria TEXT NOT NULL,
  descricao TEXT,
  data TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ativa', 'excluida')) DEFAULT 'ativa',
  CHECK ((conta_id IS NOT NULL) OR (cartao_id IS NOT NULL))
);

CREATE TABLE dividas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conta_id INTEGER NOT NULL REFERENCES contas(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('emprestimo', 'financiamento', 'consignado', 'outro')),
  valor_total REAL NOT NULL,
  num_parcelas INTEGER NOT NULL,
  valor_parcela REAL NOT NULL,
  parcelas_pagas INTEGER NOT NULL DEFAULT 0,
  taxa_juros REAL,
  sistema_amortizacao TEXT CHECK (sistema_amortizacao IN ('price', 'sac')),
  indexador TEXT NOT NULL CHECK (indexador IN ('fixo', 'ipca', 'cdi', 'selic', 'tr', 'outro')) DEFAULT 'fixo',
  taxa_indexador_spread REAL,
  periodicidade_reajuste TEXT CHECK (periodicidade_reajuste IN ('mensal', 'anual', 'nenhuma')) DEFAULT 'nenhuma',
  data_inicio TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ativo', 'quitado', 'renegociado')) DEFAULT 'ativo'
);

CREATE TABLE parcelas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  divida_id INTEGER NOT NULL REFERENCES dividas(id),
  numero_parcela INTEGER NOT NULL,
  valor REAL NOT NULL,
  data_vencimento TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pendente', 'paga', 'cancelada')) DEFAULT 'pendente',
  data_pagamento TEXT,
  origem TEXT NOT NULL CHECK (origem IN ('calculada', 'email')) DEFAULT 'calculada',
  trace_id TEXT
);

CREATE TABLE renegociacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  divida_origem_tipo TEXT NOT NULL CHECK (divida_origem_tipo IN ('divida', 'fatura')),
  divida_origem_id INTEGER NOT NULL,
  nova_divida_id INTEGER NOT NULL REFERENCES dividas(id),
  motivo TEXT,
  data TEXT NOT NULL
);

CREATE TABLE roteamento_tarefas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fluxo TEXT NOT NULL UNIQUE,
  modelo_preferido TEXT NOT NULL,
  requisitos TEXT,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE modelos_openrouter_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo TEXT NOT NULL,
  preco_prompt REAL NOT NULL,
  preco_completion REAL NOT NULL,
  capacidades TEXT,
  data_snapshot TEXT NOT NULL
);

CREATE TABLE uso_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fluxo TEXT NOT NULL,
  modelo TEXT NOT NULL,
  tokens_prompt INTEGER NOT NULL,
  tokens_completion INTEGER NOT NULL,
  custo_estimado REAL NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('uso_real', 'benchmark_interno')),
  data_hora TEXT NOT NULL
);

CREATE TABLE metas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('tokens', 'financeiro')),
  escopo TEXT NOT NULL CHECK (escopo IN ('geral', 'categoria', 'fluxo')),
  referencia TEXT,
  valor_limite REAL NOT NULL,
  periodo TEXT NOT NULL CHECK (periodo IN ('diario', 'semanal', 'mensal')),
  data_inicio TEXT NOT NULL
);

CREATE TABLE transferencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conta_origem_id INTEGER NOT NULL REFERENCES contas(id),
  conta_destino_id INTEGER NOT NULL REFERENCES contas(id),
  valor REAL NOT NULL,
  taxa REAL NOT NULL DEFAULT 0,
  descricao TEXT,
  data TEXT NOT NULL
);

CREATE TABLE despesas_fixas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conta_id INTEGER NOT NULL REFERENCES contas(id),
  cartao_id INTEGER REFERENCES cartoes(id),
  descricao TEXT NOT NULL,
  categoria TEXT NOT NULL,
  valor_esperado REAL NOT NULL,
  dia_vencimento_esperado INTEGER NOT NULL CHECK (dia_vencimento_esperado BETWEEN 1 AND 31),
  origem TEXT NOT NULL CHECK (origem IN ('email', 'manual')),
  remetente_email TEXT,
  status TEXT NOT NULL CHECK (status IN ('ativa', 'pausada')) DEFAULT 'ativa',
  criado_em TEXT NOT NULL
);

-- Observabilidade e rastreabilidade de IA — consumida pela Tarefa 7 (Fase 1).
CREATE TABLE interacoes_ia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id TEXT NOT NULL,
  fluxo TEXT NOT NULL,
  modelo TEXT NOT NULL,
  mensagem_usuario TEXT,
  resposta_modelo TEXT,
  tool_calls TEXT,
  resultado TEXT NOT NULL CHECK (resultado IN ('sucesso', 'erro', 'rejeitado')),
  avaliacao_usuario TEXT CHECK (avaliacao_usuario IN ('correto', 'incorreto')),
  data_hora TEXT NOT NULL
);
