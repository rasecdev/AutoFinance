---
status: accepted
---
# Organização do código por conceito, com fronteiras verificadas pelo CI

`src/` passa a ter uma pasta por conceito (`ai/agente`, `ai/confirmacao`, `ai/roteamento`, `ai/prompts`, `ai/guardrails`, `ai/observabilidade`, `ai/avaliacao`, `ai/tools/<domínio>`) em vez de arquivos soltos por camada técnica, para que o nome da pasta diga o que ela contém, tanto para pessoas quanto para agentes que vão ler o repositório. As Fronteiras (quem pode importar de quem) e a ausência de ciclos são impostas por um gate único, o `dependency-cruiser`, no CI, com baseline zero; as duas violações que existiam (um ciclo em `ai/benchmark` e um `import` de `ai` para `bot`) são corrigidas antes de ligar o gate. O grafo de dependências também é gerado e versionado em `docs/arquitetura/`, com checagem de CI, para ser lido por agentes.

## Considered Options

- `eslint-plugin-boundaries`, `no-restricted-imports`, teste no Vitest: descartados como gate. Ter a matriz de regras em duas ferramentas cria duas fontes da verdade que podem divergir. O plugin do ESLint pode voltar só como feedback no editor, derivado da mesma matriz.
- `madge`: cobre ciclos e grafo, mas é menos orientado a regras.

## Consequences

- O `dependency-cruiser` aceita TypeScript até a versão 6. Migrar para o TypeScript 7 (compilador nativo) pode exigir o parser `swc` até que ele passe a suportar.
- Mover arquivos muda muitos imports e os testes que espelham `src/`. Cada movimentação é um PR de movimentação pura, sem alterar comportamento, para ser fácil de revisar e de reverter.
