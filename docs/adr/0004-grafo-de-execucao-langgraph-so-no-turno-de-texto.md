---
status: accepted
---
# Grafo de execução com LangGraph.js, só no turno de texto

O turno de texto (pendência de confirmação, guardrail de entrada, agente com tool calling, confirmação, guardrail de saída, registro, resposta e gatilho de resumo) passa a ser um Grafo de execução em LangGraph.js, com Nós de nome estável. Comandos de barra continuam no roteador do bot, sem passar por modelo nem por grafo, e mídia, voz e jobs ficam fora da primeira versão, mas emitem os mesmos Passos por uma camada única de instrumentação. A razão é dupla: o fluxo de texto já tem ramificações escondidas em `if` encadeados, e o grafo é a estrutura que o Langfuse mostra como árvore de Nós, que é o que agentes e pessoas vão ler.

## Considered Options

- Grafo em todos os fluxos, inclusive comandos: descartado, comandos são determinísticos e não ganham nada.
- Máquina de estados própria, sem biblioteca: descartada por não ser o que o mercado usa e perder a integração com o Langfuse.

## Consequences

- Entra a dependência `@langchain/core` (a integração do Langfuse com LangChain/LangGraph exige a versão 1 ou superior).
- Dois pontos dependem de pesquisa antes da implementação: se existe checkpointer para o nosso SQLite criptografado (senão a pendência de confirmação continua na tabela própria) e se cada Nó vira um span no Langfuse.
