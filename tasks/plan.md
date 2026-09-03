# Plano de Implementação: Fase 6 (parte 3) — Métricas 2 e 3 do relatório de uso de IA

## Overview

O relatório (`relatorio(periodo)`) já tem a Métrica 1 (custo hipotético do volume de tokens do período, recalculado no preço de modelos de referência) implementada e funcionando. Esta rodada implementa as Métricas 2 e 3 já desenhadas no PLANO.md ("Relatórios (diário, semanal, mensal) e metas", linhas ~215-227), que passam a **ler** `benchmarks_modelos` — tabela que só tem dado real hoje pra `fluxo = conversa_texto` (`metrica = acuracia_tool_calling`, gravada pela Tarefa 35, Fase 6 parte 2), suficiente pra verificar esta rodada de ponta a ponta.

## Architecture Decisions

- **Fonte do "modelo real em uso por fluxo" é `uso_tokens` do próprio período, não `roteamento_tarefas`.** O PLANO.md fala em "o modelo que o roteamento escolheu de verdade" — mas o dado mais direto e sempre coerente com o que o relatório já mostra é `AgregacaoUsoIa.porFluxoModelo` (já calculado pela Tarefa em uso, filtrado `origem = uso_real`): é literalmente o par fluxo/modelo que gerou custo real naquele período, sem depender de `roteamento_tarefas` estar sincronizado com a lógica de roteamento de verdade (tabela que pode ficar desatualizada sem ninguém notar). Evita introduzir uma segunda fonte de verdade pra "modelo ativo".
- **Métrica 3 (custo real + benchmark do modelo em uso, lado a lado, sem fórmula):** pra cada `{fluxo, modelo}` em `porFluxoModelo`, busca `listarBenchmarks(db, fluxo, modelo)` — se houver alguma linha, mostra o custo real do período **junto com** a métrica mais recente daquele benchmark (ex: "conversa_texto: US$ 0,002341, modelo openai/gpt-4o-mini (acuracia_tool_calling: 100%, segundo interno)"). Sem benchmark cadastrado pro modelo daquele fluxo, a linha simplesmente não aparece — degradação graciosa já usada na Métrica 1.
- **Métrica 2 (fator de acurácia relativo, só quando comparável):** decisão explícita do usuário pra resolver a ambiguidade de "fator" ter naturezas diferentes por linha de benchmark (percentual de acurácia vs. "34% menos tokens" vs. índice composto 0-100) — Métrica 2 só existe quando o modelo real em uso **e** o candidato de referência (mesmo conjunto da Métrica 1) têm benchmark da **mesma métrica nomeada** (ex: `acuracia_tool_calling`) pro **mesmo fluxo**. Fator = `valor do modelo real em uso ÷ valor do candidato`; custo ajustado = custo hipotético do candidato pra aquele fluxo (tokens reais do fluxo × preço do candidato) × fator. Interpretação: se o candidato é menos preciso que o modelo real em uso pra essa tarefa, custaria proporcionalmente mais alcançar o mesmo resultado (ajuste pra cima); se for mais preciso, ajuste pra baixo. Sem as duas pontas comparáveis (mesma métrica, mesmo fluxo), Métrica 2 não aparece pra aquele fluxo/candidato — mostra só a Métrica 1 (já existente, não é removida nem alterada).
- **Métrica 2 é por fluxo, não mais só global.** A Métrica 1 atual soma tokens de todos os fluxos e recalcula custo hipotético global — comportamento existente, mantido como está (não redesenha). Métrica 2 precisa de tokens **por fluxo** (pra multiplicar pelo preço do candidato e aplicar o fator daquele fluxo específico) — usa o total de tokens por fluxo já disponível em `porFluxoModelo` (soma entre todos os modelos que rodaram aquele fluxo no período), não introduz agregação nova.
- **Nenhuma chamada de IA nova, nenhuma tabela nova.** Todo o trabalho é leitura (`listarBenchmarks`, já existe desde a Tarefa 31) + aritmética determinística sobre dado já coletado — mesmo espírito da Métrica 1 e da regra "relatório nunca dispara benchmark, só lê".
- **Ordem de implementação**: Métrica 3 primeiro (mais simples, sem fórmula, só lookup + exibição lado a lado) — serve de base pro "modelo real em uso por fluxo" que a Métrica 2 também precisa. Métrica 2 depois, reaproveitando esse lookup.

```
agregarUsoIaPeriodo: lookup de benchmark por {fluxo, modelo real} (Tarefa 36)
    │
    └── formatarRelatorio: exibe Métrica 3 (Tarefa 37)
            │
            └── agregarUsoIaPeriodo: calcula Métrica 2 (fator de acurácia, quando comparável) (Tarefa 38)
                    │
                    └── formatarRelatorio: exibe Métrica 2 (Tarefa 39)
```

## Task List

### Fase O: Métrica 3

- [x] Tarefa 36: `agregarUsoIaPeriodo` busca benchmark do modelo real em uso por fluxo (`listarBenchmarks(db, fluxo, modelo)`) e expõe no retorno (`metrica3`)
- [x] Tarefa 37: `formatarRelatorio` exibe a Métrica 3 (custo real do fluxo + benchmark do modelo em uso, quando existir)

### Checkpoint: Métrica 3 funcional
- [x] `npm run build`/`lint`/`test` sem erro (493/493 em `development`)
- [x] Teste manual em Homologação: `relatorio(periodo=...)` num período com uso real de `conversa_texto` mostra a linha da Métrica 3 com o benchmark real já cadastrado (`acuracia_tool_calling`, Tarefa 35)

### Fase P: Métrica 2

- [x] Tarefa 38: `agregarUsoIaPeriodo` calcula o fator de acurácia relativo por fluxo/candidato (quando modelo real em uso e candidato têm benchmark da mesma métrica nomeada no mesmo fluxo) e expõe no retorno (`metrica2`)
- [x] Tarefa 39: `formatarRelatorio` exibe a Métrica 2 (custo ajustado pelo fator, rotulado como estimativa) junto da Métrica 1 existente, sem substituí-la

### Checkpoint: Métrica 2 funcional (Fase 6 parte 3 concluída)
- [x] `npm run build`/`lint`/`test` sem erro
- [x] Teste manual em Homologação: `relatorio(periodo=...)` no mesmo período mostra a Métrica 2 ajustada pro(s) candidato(s) que têm benchmark comparável (`acuracia_tool_calling`) contra o modelo real em uso em `conversa_texto`
- [x] PROGRESSO.md atualizado com o marco "Fase 6 (parte 3) concluída"
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)

### Fase Q: Seed de casos de teste curados

- [ ] Tarefa 40: script de seed com casos de teste fixos (`origem: 'curado'`) cobrindo tarefas básicas, as mais usadas (dado real de `interacoes_ia`) e as de maior impacto financeiro (`requerConfirmacao: true`)

**Contexto:** até aqui, `casos_teste_benchmark` só crescia organicamente via `/certo` + `criar_caso_teste_benchmark` (Tarefa 33) — depende de alguém usar o bot e marcar respostas como certas antes de existir qualquer caso pra testar. Pedido do usuário: um conjunto fixo, curado uma vez, que não depende de uso orgânico anterior.

**Dado real consultado em Homologação antes de escolher os casos** (`interacoes_ia`, fluxo `conversa_texto`, contagem de nome de tool call): `consultar_saldo` (12), `relatorio` (8), `editar_transacao` (7), `resumo_mensal` (6), `consultar_dividas_ativas` (6), `editar_despesa_fixa` (5), `consultar_extrato` (4), `criar_conta`/`criar_divida` (3 cada). **Achado:** dentro de um único fluxo, custo não é atribuível por ferramenta (é por chamada de IA, dominado pelo tamanho do prompt/histórico, não por qual tool foi chamada) — não existe "ferramenta mais cara" mensurável nesse nível. Decisão do usuário: trocar essa dimensão por "maior impacto financeiro real", usando `requerConfirmacao: true` como critério objetivo (`criar_divida`, `quitar_divida`, `amortizar_divida`, `renegociar`, `excluir_transacao`) em vez de tentar forçar uma noção de custo que não existe aqui.

**Casos excluídos deliberadamente:** `editar_transacao`, `editar_despesa_fixa`, `pagar_parcela` (sem `numero_parcela`) dependem de contexto de turno anterior (resolvem pra "a última X desta conversa") — não são autocontidos, mesma ressalva já documentada no risco de casos dependentes de contexto (ver tabela de riscos). Ficam de fora do seed fixo; continuam curáveis organicamente via `/certo` quando o turno anterior já estabeleceu o contexto.

**Lista de 13 casos** (entrada → tool call esperado, contas/cartões fictícios — o motor de benchmark nunca executa o handler, então não precisam existir no banco):
1. "oi" → `[]` (baseline sem ferramenta)
2. "qual meu saldo da conta Nubank?" → `consultar_saldo({conta_apelido: "Nubank"})`
3. "registra 50 reais de transporte na conta Nubank" → `registrar_transacao({conta_apelido: "Nubank", tipo: "despesa", valor: 50, categoria: "transporte"})`
4. "cria uma conta corrente no Nubank, PF, apelido Nubank" → `criar_conta({banco: "Nubank", tipo: "PF", apelido: "Nubank"})`
5. "me manda o relatório de hoje" → `relatorio({periodo: "dia"})`
6. "resumo do mês na conta Nubank" → `resumo_mensal({conta_apelido: "Nubank"})`
7. "quais dívidas eu tenho na conta Nubank?" → `consultar_dividas_ativas({conta_apelido: "Nubank"})`
8. "extrato da conta Nubank esse mês" → `consultar_extrato({conta_apelido: "Nubank"})`
9. "cria uma dívida de financiamento de 12000 reais em 24 parcelas na conta Nubank" → `criar_divida({conta_apelido: "Nubank", tipo: "financiamento", valor_total: 12000, num_parcelas: 24})`
10. "quita a dívida de financiamento da conta Nubank" → `quitar_divida({conta_apelido: "Nubank", tipo_divida: "financiamento"})`
11. "amortiza 500 reais da dívida de financiamento da conta Nubank, reduzindo o valor das parcelas" → `amortizar_divida({conta_apelido: "Nubank", tipo_divida: "financiamento", valor: 500, modo: "reduzir_valor"})`
12. "renegocia a dívida de financiamento da conta Nubank pra 15000 em 30 parcelas" → `renegociar({origem: "divida", conta_apelido: "Nubank", tipo_divida: "financiamento", valor_total: 15000, num_parcelas: 30})`
13. "exclui a última transação" → `excluir_transacao({})`

**Idempotência:** o script pula (não duplica) casos cuja `entrada` já existe pro fluxo `conversa_texto` — pode rodar de novo em qualquer ambiente sem gerar duplicata.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hoje só existe benchmark real pra 1 fluxo (`conversa_texto`) e 2 modelos (`openai/gpt-4o-mini`, `qwen/qwen3-32b`) — teste manual de ponta a ponta fica restrito a esse caso | Baixo (esperado, documentado desde o plano da Fase 6 parte 2) | Teste manual usa exatamente esse dado real já existente; degradação graciosa cobre os demais fluxos sem benchmark |
| Fator de Métrica 2 pode ficar > 1 ou muito distante de 1 se as métricas comparadas não forem realmente equivalentes (ex: acurácia medida em datasets diferentes) | Médio (número "estimativa" mal interpretado como medição precisa) | Rótulo explícito de "estimativa" no texto do relatório (já é a convenção da Métrica 1); só ativa quando a métrica nomeada é idêntica nos dois lados (mesmo dataset/metodologia por construção, já que ambos vêm de rodadas do mesmo benchmark interno) |
| Múltiplas linhas de benchmark pro mesmo `{fluxo, modelo, metrica}` (curadoria rodada de novo) podem dar ambiguidade sobre qual valor usar | Baixo | `listarBenchmarks` já ordena por `id DESC` — usa a primeira ocorrência de cada métrica (mais recente), mesmo padrão de "dado curado, não histórico” |

## Open Questions

- Nenhuma pendente — fórmula da Métrica 2 confirmada explicitamente com o usuário (fator = acurácia do modelo real em uso ÷ acurácia do candidato, só quando a métrica nomeada é a mesma nos dois lados).
