# Plano de Implementação: Fase 6 (parte 1) — Relatórios automáticos (diário/semanal/mensal)

## Overview

Fase 6 do PLANO.md é um conjunto solto de refinamentos (relatórios, benchmark de qualidade, categorização assistida, projeção de fluxo de caixa, consulta dinâmica, transcrição de áudio, etc.) — grande demais e sem prioridade única. A pedido do usuário, esta rodada cobre só **relatórios automáticos (diário/semanal/mensal)**, a peça de maior uso real imediato: resumo de gastos e consumo de IA por período, sem precisar perguntar pro bot toda vez. Os demais itens da Fase 6 ficam pra rodadas futuras, sob demanda.

Escopo conforme PLANO.md > "Relatórios (diário, semanal, mensal) e metas" (linhas 202-331), recortado pras seções 1 ("Uso do ecossistema de IA") e 2 ("Financeiro do período") — metas (seção 3), limite de cartão (seção 4), projeção de fluxo de caixa (5), patrimônio líquido (6), simulador (7) e consulta dinâmica (8) ficam fora desta rodada (nenhuma dessas tem CRUD/tool implementado ainda; `metas` é tabela vazia desde a Fase 1, sem uso).

## Architecture Decisions

- **Diário é sob demanda (tool exposta à IA), semanal e mensal são push automático** — decisão explícita já registrada no PLANO.md ("demanda" pro diário, evita ruído de notificação repetitiva; semanal/mensal continuam automáticos). Job semanal/mensal segue o mesmo padrão operacional já validado nas Fases 1/5 (`docker-compose`, serviço dedicado com `while true` + `sleep`, sem lib de agendamento nova) — mas com um agendamento por dia da semana/dia do mês, não um intervalo fixo simples como backup/monitor-precos (ver Tarefa 29/30).
- **Diário e semanal são template de texto puro, sem IA** — é aritmética sobre dado já coletado (`transacoes`, `uso_tokens`, `interacoes_ia`), custo zero de token. **Só o mensal usa IA**, e só pra costurar um resumo narrativo em cima de números já calculados pelo código — o modelo nunca soma, nunca calcula percentual, nunca gera o dado em si (mesma regra já usada no resumo de contexto da Fase 4: modelo nunca inventa número sobre dinheiro real).
- **Métrica 1 (comparação token-a-token com modelos de referência) entra nesta rodada** — é só aritmética sobre dado já existente (`uso_tokens` × preço de `modelos_openrouter_historico`, ambos já implementados na Fase 5), sem chamada de IA extra. Nova tabela pequena `modelos_referencia_comparacao` (2-4 linhas, curadoria manual — mesmo padrão de tabela "começa vazia, você popula depois" já usado em `roteamento_tarefas`).
- **Métricas 2 e 3 (comparação por benchmark) ficam fora desta rodada** — dependem de `benchmarks_modelos`, que não existe em nenhuma fase implementada ainda (confirmado na Fase 5, registrado como limitação conhecida). O relatório já é desenhado no PLANO.md pra degradar graciosamente sem essas métricas ("se não existir benchmark, a linha simplesmente não aparece") — não é preciso código condicional novo pra "desligar" isso, só não construímos a leitura de uma tabela que não existe.
- **"Problemas encontrados no período" usa só `interacoes_ia.avaliacao_usuario = 'incorreto'`** — o PLANO.md também pede contagem de `erros_execucao`, mas essa tabela não existe em nenhuma migração ainda (não foi criada em nenhuma fase até aqui). Fica de fora desta rodada; se/quando `erros_execucao` for implementada (provável Fase 6 futura, junto de tratamento de erro mais amplo), o relatório ganha essa contagem sem precisar mudar a estrutura já construída aqui.
- **Sem tabela de metas nesta rodada** — `metas` existe desde a Fase 1 mas está vazia e sem nenhuma tool de CRUD; a seção 3 do PLANO.md (progresso de meta, alerta em tempo real) depende de metas existirem primeiro. Fica fora do escopo, não bloqueia o relatório financeiro/de IA funcionar sem isso.
- **Motor de agregação como funções puras e testáveis, separado do texto final** — mesmo padrão já usado no projeto (`src/finance/amortizacao.ts` isolado de qualquer I/O): `src/relatorios/` reúne funções que recebem `db` + período e devolvem dado estruturado (números, não string), e módulos separados formatam esse dado em texto. Facilita testar a aritmética sem precisar montar string, e reusa a mesma agregação entre diário/semanal/mensal (só muda a janela de tempo e se compara com o período anterior).
- **Ordem de implementação**: agregação financeira e de uso de IA primeiro (fundação, sem elas nenhum relatório existe), depois a tool `relatorio(periodo)` sob demanda (valor mais imediato, cobre diário sozinho), depois os jobs automáticos de semanal/mensal (reaproveitam a mesma agregação e formatação, só trocam o gatilho e adicionam comparação com período anterior + resumo narrativo no mensal).

```
Agregação financeira do período (Tarefa 26)
    │
    ├── Agregação de uso de IA do período + Métrica 1 (Tarefa 27)
    │       │
    │       └── Tool relatorio(periodo) — diário sob demanda (Tarefa 28)
    │               │
    │               ├── Job semanal automático (Tarefa 29)
    │               │
    │               └── Job mensal automático + resumo via IA (Tarefa 30)
```

## Task List

### Fase K: Motor de agregação

- [x] Tarefa 26: Agregação financeira do período (transações por categoria, saldo consolidado, comparação com período anterior)
- [ ] Tarefa 27: Agregação de uso de IA do período (tokens/custo por fluxo+modelo, `origem = uso_real`, tendência vs. período anterior, Métrica 1 com `modelos_referencia_comparacao` novo) + contagem de `avaliacao_usuario = 'incorreto'`

### Checkpoint: Agregação testada
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Revisão com o usuário antes de prosseguir

### Fase L: Relatório sob demanda e automação

- [ ] Tarefa 28: Tool `relatorio(periodo)` — monta e formata o relatório diário/semanal/mensal sob demanda (texto puro, sem IA), registrada em `texto.ts`
- [ ] Tarefa 29: Job semanal automático (push via Telegram, mesmo padrão operacional de `backup`/`monitorarPrecos`) — reaproveita a mesma formatação da Tarefa 28, com comparação vs. semana anterior
- [ ] Tarefa 30: Job mensal automático + resumo narrativo via IA (fluxo dedicado `relatorio_mensal`, roteado via `roteamento_tarefas` como qualquer outro fluxo — números sempre pré-calculados e injetados no prompt, nunca gerados pelo modelo)

### Checkpoint: Fase 6 (parte 1) completa
- [ ] Todos os critérios de aceite das Tarefas 26-30 atendidos
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: `relatorio(periodo=dia)` sob demanda, e pelo menos um disparo manual do job semanal/mensal confirmando mensagem recebida no Telegram com números batendo com o banco
- [ ] PROGRESSO.md atualizado com o marco "Fase 6 (parte 1) concluída"
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Job semanal/mensal com agendamento por dia da semana/mês (não intervalo fixo) é mais complexo que o `sleep N` já usado em backup/monitor-precos | Médio | Calcular o próximo horário-alvo (ex: próximo domingo 23h) e dormir até lá, reavaliando a cada execução — sem lib de cron nova, só aritmética de data no próprio script |
| Relatório mensal usando IA pra narrar pode "vazar" para inventar número se o prompt não for explícito o bastante | Alto (Misinformation sobre dinheiro real) | Mesma regra já aplicada em `resumir_contexto` (Fase 4): todo número que aparece no texto final vem pré-calculado e injetado no prompt como dado estruturado; prompt do fluxo instruído a nunca calcular, só narrar |
| Escopo da Fase 6 é grande — risco de a "parte 1" crescer pra cobrir metas/limite de cartão/consulta dinâmica no meio do caminho | Médio | Escopo desta rodada fechado explicitamente nesta revisão (só seções 1 e 2 do PLANO.md); qualquer necessidade de metas/cartão/etc. vira nova rodada, não expande esta |

## Open Questions

- Horário exato do job semanal (PLANO.md sugere "domingo à noite") e mensal ("último dia do mês") — validar na prática durante a Tarefa 29/30, sem bloquear o desenho.
- Quais 2-4 modelos entram em `modelos_referencia_comparacao` inicialmente — decisão do usuário, populada manualmente depois da Tarefa 27 (tabela nasce vazia, mesmo padrão de `roteamento_tarefas`).
