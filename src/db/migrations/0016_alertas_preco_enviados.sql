-- Achado real (2026-09-21, pedido do usuário): o mesmo alerta de preço
-- (ex: "modelo X é mais barato pro fluxo Y") aparecia repetido a cada
-- restart do container de monitorarPrecos.ts (frequente em dias com vários
-- deploys), porque detectarOportunidades recalcula do zero a cada rodada,
-- sem lembrar o que já foi avisado. Chave de dedup inclui o preço (não só
-- fluxo+tipo+modelo) de propósito: se o preço mudar de novo depois, é uma
-- informação nova e deve alertar de novo; o que não deve se repetir é o
-- mesmo alerta, sobre o mesmo preço, sendo mandado várias vezes.
CREATE TABLE alertas_preco_enviados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fluxo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  modelo TEXT NOT NULL,
  preco REAL NOT NULL,
  criado_em TEXT NOT NULL,
  UNIQUE (fluxo, tipo, modelo, preco)
);
