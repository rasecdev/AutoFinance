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

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hoje só existe benchmark real pra 1 fluxo (`conversa_texto`) e 2 modelos (`openai/gpt-4o-mini`, `qwen/qwen3-32b`) — teste manual de ponta a ponta fica restrito a esse caso | Baixo (esperado, documentado desde o plano da Fase 6 parte 2) | Teste manual usa exatamente esse dado real já existente; degradação graciosa cobre os demais fluxos sem benchmark |
| Fator de Métrica 2 pode ficar > 1 ou muito distante de 1 se as métricas comparadas não forem realmente equivalentes (ex: acurácia medida em datasets diferentes) | Médio (número "estimativa" mal interpretado como medição precisa) | Rótulo explícito de "estimativa" no texto do relatório (já é a convenção da Métrica 1); só ativa quando a métrica nomeada é idêntica nos dois lados (mesmo dataset/metodologia por construção, já que ambos vêm de rodadas do mesmo benchmark interno) |
| Múltiplas linhas de benchmark pro mesmo `{fluxo, modelo, metrica}` (curadoria rodada de novo) podem dar ambiguidade sobre qual valor usar | Baixo | `listarBenchmarks` já ordena por `id DESC` — usa a primeira ocorrência de cada métrica (mais recente), mesmo padrão de "dado curado, não histórico” |

## Open Questions

- Nenhuma pendente — fórmula da Métrica 2 confirmada explicitamente com o usuário (fator = acurácia do modelo real em uso ÷ acurácia do candidato, só quando a métrica nomeada é a mesma nos dois lados).
