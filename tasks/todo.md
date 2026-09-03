# Tarefas: Fase 6 (parte 3) — Métricas 2 e 3 do relatório de uso de IA

Ver `tasks/plan.md` pro desenho completo (decisões de arquitetura, riscos, ordem). Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md` — não repetido aqui.

## Fase O: Métrica 3

### Tarefa 36: `agregarUsoIaPeriodo` — lookup de benchmark do modelo real em uso por fluxo

**Description:** Pra cada `{fluxo, modelo}` já presente em `AgregacaoUsoIa.porFluxoModelo` (uso real do período), busca `listarBenchmarks(db, fluxo, modelo)`. Quando houver ao menos uma linha, expõe no retorno de `agregarUsoIaPeriodo` uma nova métrica (`metrica3: MetricaModeloEmUso[]`) com `{fluxo, modelo, custoEstimado (já calculado em porFluxoModelo), metrica: nome, valor, fonteUrl}` usando a linha mais recente de cada `metrica` nomeada encontrada. Sem benchmark pra aquele `{fluxo, modelo}`, não entra no array (degradação graciosa).

**Acceptance criteria:**
- [ ] `metrica3` tem uma entrada por `{fluxo, modelo, metrica}` onde existe benchmark cadastrado
- [ ] `{fluxo, modelo}` sem benchmark cadastrado não aparece em `metrica3`
- [ ] Múltiplas métricas nomeadas pro mesmo `{fluxo, modelo}` geram uma entrada por métrica

**Verification:**
- [ ] `npm test -- tests/relatorios/usoIa.test.ts`
- [ ] `npm run build`

**Dependencies:** None (usa `listarBenchmarks`, já existente desde a Tarefa 31)

**Files likely touched:**
- `src/relatorios/usoIa.ts`
- `tests/relatorios/usoIa.test.ts`

**Estimated scope:** Small (1 arquivo de código + teste)

---

### Tarefa 37: `formatarRelatorio` — exibir Métrica 3

**Description:** Na seção "Uso de IA" do texto do relatório, depois da Métrica 1 existente, adiciona uma linha por entrada de `metrica3`: custo real do período naquele fluxo junto com o valor do benchmark do modelo em uso (ex: `- conversa_texto (openai/gpt-4o-mini): US$ 0,002341 no período — acuracia_tool_calling: 100% (fonte: interno)`). Sem nenhuma entrada em `metrica3`, a seção inteira não aparece (mesma regra de degradação graciosa da Métrica 1).

**Acceptance criteria:**
- [ ] Relatório com `metrica3` não vazio mostra a nova seção com custo real + valor de benchmark por linha
- [ ] Relatório com `metrica3` vazio não mostra a seção (sem texto vazio nem cabeçalho solto)

**Verification:**
- [ ] `npm test -- tests/relatorios/formatar.test.ts`
- [ ] `npm run build`

**Dependencies:** Tarefa 36

**Files likely touched:**
- `src/relatorios/formatar.ts`
- `tests/relatorios/formatar.test.ts`

**Estimated scope:** Small (1 arquivo de código + teste)

## Checkpoint: Métrica 3 funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: pedir `relatorio` (período com uso real de `conversa_texto`) via Telegram real e confirmar que a seção da Métrica 3 aparece com o benchmark real (`acuracia_tool_calling`) já cadastrado na Tarefa 35

## Fase P: Métrica 2

### Tarefa 38: `agregarUsoIaPeriodo` — calcular fator de acurácia relativo (Métrica 2)

**Description:** Reaproveitando o lookup da Tarefa 36 (benchmark do modelo real em uso por fluxo), calcula pra cada candidato de referência (mesmo conjunto de `metrica1`) que tenha benchmark da **mesma métrica nomeada** pro **mesmo fluxo**: `fator = valorModeloEmUso / valorCandidato`, `custoAjustado = (tokensDoFluxoNoPeríodo × precoDoCandidato) × fator`. Expõe no retorno (`metrica2: MetricaAjustadaPorFluxo[]`) com `{fluxo, nomeExibicaoCandidato, modelo, metrica: nome, custoAjustado}`. Sem par comparável (mesma métrica nos dois lados), não gera entrada pra aquele `{fluxo, candidato}` — cai de volta pra só Métrica 1 (já existente, inalterada).

**Acceptance criteria:**
- [ ] Fluxo/candidato com benchmark da mesma métrica nos dois lados gera entrada em `metrica2` com o fator aplicado corretamente
- [ ] Fluxo/candidato sem benchmark comparável (métrica nomeada diferente, ou só um lado tem benchmark) não gera entrada
- [ ] `metrica1` continua exatamente como está hoje (não alterada por esta tarefa)

**Verification:**
- [ ] `npm test -- tests/relatorios/usoIa.test.ts`
- [ ] `npm run build`

**Dependencies:** Tarefa 36

**Files likely touched:**
- `src/relatorios/usoIa.ts`
- `tests/relatorios/usoIa.test.ts`

**Estimated scope:** Small (1 arquivo de código + teste)

---

### Tarefa 39: `formatarRelatorio` — exibir Métrica 2

**Description:** Na seção "Uso de IA", junto da comparação hipotética da Métrica 1 já existente, adiciona (quando houver `metrica2` pro candidato) o custo ajustado pelo fator de acurácia, rotulado como estimativa (ex: `- Claude Sonnet 4.5: US$ 0,004102 (ajustado por acuracia_tool_calling — estimativa)`, ao lado da linha já existente da Métrica 1 pro mesmo candidato). Sem `metrica2` pro candidato/fluxo, mostra só a linha da Métrica 1 já existente (sem alteração).

**Acceptance criteria:**
- [ ] Candidato com `metrica2` disponível mostra a linha ajustada além da linha de Métrica 1
- [ ] Candidato sem `metrica2` mostra só a linha de Métrica 1 (comportamento atual preservado)

**Verification:**
- [ ] `npm test -- tests/relatorios/formatar.test.ts`
- [ ] `npm run build`

**Dependencies:** Tarefa 38, Tarefa 37 (mesma seção do relatório)

**Files likely touched:**
- `src/relatorios/formatar.ts`
- `tests/relatorios/formatar.test.ts`

**Estimated scope:** Small (1 arquivo de código + teste)

## Checkpoint: Métrica 2 funcional (Fase 6 parte 3 concluída)
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: `relatorio(periodo=...)` no mesmo período mostra a Métrica 2 ajustada pro(s) candidato(s) comparáveis contra o modelo real em uso em `conversa_texto`
- [ ] PROGRESSO.md atualizado com o marco "Fase 6 (parte 3) concluída"
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)
