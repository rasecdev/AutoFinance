# AutoFinance

Bot financeiro pessoal via Telegram: controle de contas, cartões, dívidas e transações, com IA fazendo tool calling sobre um backend que é a fonte de verdade dos dados.

## Language

**Categoria**:
Classificação de uma transação de receita/despesa — texto livre (`transacoes.categoria`, `TEXT`), decidido pela IA ou pelo usuário na hora, sem tabela própria nem hierarquia (ver [ADR 0002](docs/adr/0002-categoria-continua-texto-livre.md); uma tabela `categorias` hierárquica chegou a ser desenhada no [ADR 0001](docs/adr/0001-categoria-tabela-auto-referenciada.md), nunca implementada, superseded).
_Avoid_: "categoria-raiz"/"subcategoria" como conceito do domínio atual (era do desenho superseded do ADR 0001); tag; classificação; label.

**`cache_categorizacao`**:
Tabela que memoiza `descricao_normalizada → categoria` pra evitar a IA re-decidir a categoria de uma descrição já vista, e pra fixar a categoria certa depois de uma correção do usuário (`origem: usuario` nunca mais é sobrescrita pela IA). Não é uma tabela de categorias — categoria continua sendo texto livre, isso só evita repetir a mesma decisão pra descrição repetida.
_Avoid_: "cache de categorias" (não guarda a lista de categorias, guarda decisões passadas por descrição).

### IA, observabilidade e arquitetura

**Interação**:
Uma mensagem do usuário até a resposta final do bot, identificada por um `trace_id` e registrada em `interacoes_ia`.
_Avoid_: turno, request, chamada.

**Passo**:
Uma chamada ao modelo ou uma execução de tool dentro de uma Interação. Cada Passo pertence a um Nó do Grafo de execução e é registrado só como metadado (nome, duração, tokens, custo, resultado), nunca com o conteúdo.
_Avoid_: etapa, step, span.

**Nó**:
Uma etapa nomeada do Grafo de execução (por exemplo, guardrail de entrada, agente, confirmação). O nome de um Nó é estável e só muda por ADR.
_Avoid_: estágio, módulo.

**Grafo de execução**:
O fluxo de uma Interação de texto em tempo de execução, feito de Nós e arestas. É o que aparece no Langfuse.
_Avoid_: pipeline, workflow, grafo (sozinho: ambíguo com o Grafo de dependências).

**Grafo de dependências**:
Quem importa quem entre os módulos do código, analisado pelo gate de arquitetura. Não tem relação com o Grafo de execução.
_Avoid_: grafo de chamadas, árvore de imports.

**Fronteira**:
Regra que diz quais pastas por conceito podem importar de quais outras. Violá-la falha o CI.
_Avoid_: camada, layer, módulo permitido.

**Guardrail**:
Verificação determinística aplicada à entrada de conteúdo externo ou à saída do modelo. Cada regra tem um Código estável e, ao disparar, registra um evento no Passo.
_Avoid_: filtro, validação, moderação.

**Prompt versionado**:
Texto enviado ao modelo guardado em arquivo próprio, com nome e versão. A versão `nome@versao` acompanha toda Interação que o usou.
_Avoid_: template, system prompt (é um caso particular de prompt versionado).

**Código**:
Identificador estável de um tipo de erro ou de um evento de Guardrail, definido no catálogo versionado no repositório. Substitui mensagem de texto livre como o que se compartilha com ferramentas e agentes.
_Avoid_: tipo de erro, código HTTP, mensagem de erro.

**Metadado de observabilidade**:
O que pode sair do banco local para Langfuse, Grafana ou agentes: Códigos, `trace_id`, nomes de tool e de Nó, nomes e tipos dos argumentos, durações, tokens e custos. O conteúdo das conversas nunca é Metadado de observabilidade.
_Avoid_: log, telemetria, payload.
