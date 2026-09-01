# AutoFinance

Bot financeiro pessoal via Telegram: controle de contas, cartões, dívidas e transações, com IA fazendo tool calling sobre um backend que é a fonte de verdade dos dados.

## Language

**Categoria**:
Classificação de uma transação de receita/despesa, dado próprio (tabela `categorias`), não texto livre. Auto-referenciada via `categoria_pai_id`: uma linha sem pai é uma categoria-raiz (ex: "Alimentação"), uma linha com pai é sua subcategoria (ex: "Delivery", filha de "Alimentação"). Hierarquia fixa em 2 níveis — uma subcategoria nunca tem `categoria_pai_id` apontando pra outra subcategoria.
_Avoid_: Subcategoria como tabela separada (é a mesma tabela `categorias`, só com `categoria_pai_id` preenchido); tag; classificação; label.

**Categoria-raiz**:
Uma linha de `categorias` com `categoria_pai_id` nulo. É o nível 1 da hierarquia (ex: "Transporte").
_Avoid_: Categoria-pai fora do contexto de uma subcategoria específica — use "categoria-raiz" pra falar do conceito em geral, "categoria-pai" só quando o contexto já é uma subcategoria e você quer nomear a raiz dela.
