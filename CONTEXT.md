# AutoFinance

Bot financeiro pessoal via Telegram: controle de contas, cartões, dívidas e transações, com IA fazendo tool calling sobre um backend que é a fonte de verdade dos dados.

## Language

**Categoria**:
Classificação de uma transação de receita/despesa — texto livre (`transacoes.categoria`, `TEXT`), decidido pela IA ou pelo usuário na hora, sem tabela própria nem hierarquia (ver [ADR 0002](docs/adr/0002-categoria-continua-texto-livre.md); uma tabela `categorias` hierárquica chegou a ser desenhada no [ADR 0001](docs/adr/0001-categoria-tabela-auto-referenciada.md), nunca implementada, superseded).
_Avoid_: "categoria-raiz"/"subcategoria" como conceito do domínio atual (era do desenho superseded do ADR 0001); tag; classificação; label.

**`cache_categorizacao`**:
Tabela que memoiza `descricao_normalizada → categoria` pra evitar a IA re-decidir a categoria de uma descrição já vista, e pra fixar a categoria certa depois de uma correção do usuário (`origem: usuario` nunca mais é sobrescrita pela IA). Não é uma tabela de categorias — categoria continua sendo texto livre, isso só evita repetir a mesma decisão pra descrição repetida.
_Avoid_: "cache de categorias" (não guarda a lista de categorias, guarda decisões passadas por descrição).
