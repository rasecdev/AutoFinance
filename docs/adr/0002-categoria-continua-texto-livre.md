# Categoria continua texto livre — ADR 0001 superseded

**Supersede [ADR 0001](0001-categoria-tabela-auto-referenciada.md).**

O ADR 0001 (2026-08-31, decidido via skill Wayfinder, antes de qualquer código da Fase 6 existir) decidiu normalizar `categoria` numa tabela própria `categorias`, auto-referenciada em 2 níveis, com uma taxonomia inicial de 12 categorias-raiz de despesa + 5 de receita curada de fontes reais (Organizze, Mobills). Nunca chegou a ser implementado — nenhuma tarefa de `tasks/todo.md` chegou a criar essa tabela.

Na Fase 6 (parte 6), ao implementar `cache_categorizacao` (categorização automática assistida por descrição), essa decisão foi revisitada do zero — sem que quem planejou naquele momento soubesse que o ADR 0001 já existia — e chegou à conclusão oposta: manter `categoria` como `TEXT` livre (ver PROGRESSO.md, achado de 2026-09-11 que encontrou o conflito). Motivo real de manter texto livre em vez de implementar o ADR 0001 agora:

- **`cache_categorizacao` já resolve o problema que motivou o ADR 0001** (inconsistência de categoria pra mesma descrição) por um caminho mais barato: reaproveitar a categoria já usada pra uma descrição normalizada repetida, sem precisar de FK nem de uma lista fixa pra isso funcionar.
- **Não existe dado de uso real ainda** pra validar se a taxonomia de 12+5 categorias do ADR 0001 é a certa pro uso de quem usa o bot — implementar uma lista fixa agora seria travar uma hipótese de pesquisa (por melhor que seja a fonte) antes de ter evidência do próprio uso.
- **Criar `categorias` agora é escopo bem maior** que o pedido original da Fase 6 parte 6 (migração de `transacoes`/`cache_categorizacao`/`despesas_fixas` pra FK, tool de gestão de categoria, seed de dado) — contra o princípio de código mínimo do projeto.

A pesquisa de taxonomia do ADR 0001 (`tasks/wayfinder/research/taxonomia-categorias-br.md`) continua válida e não é descartada — vira referência pra quando `categorias` for criada de verdade (cruzando com o que `cache_categorizacao` acumular de uso real, e com o que o Pluggy devolver na Fase 8), não uma lista importada direto.

**Lição de processo, não só de dado:** o ADR 0001 só foi encontrado numa auditoria retroativa, depois de duas rodadas de pesquisa chegarem a respostas opostas pra mesma pergunta. `PLANO.md` ("Decisões em aberto") e `PROGRESSO.md` (Estado atual) precisam ser o ponto de entrada real de qualquer decisão de arquitetura antes de reabrir uma pergunta já respondida — um ADR sozinho, sem essa referência cruzada, é fácil de não achar.
