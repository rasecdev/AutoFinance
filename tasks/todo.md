# Tarefas: Fase 6 (parte 3) — Métricas 2 e 3 do relatório de uso de IA

Ver `tasks/plan.md` pro desenho completo (decisões de arquitetura, riscos, ordem). Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md` — não repetido aqui.

## Fase O: Métrica 3

### Tarefa 36: `agregarUsoIaPeriodo` — lookup de benchmark do modelo real em uso por fluxo

**Description:** Pra cada `{fluxo, modelo}` já presente em `AgregacaoUsoIa.porFluxoModelo` (uso real do período), busca `listarBenchmarks(db, fluxo, modelo)`. Quando houver ao menos uma linha, expõe no retorno de `agregarUsoIaPeriodo` uma nova métrica (`metrica3: MetricaModeloEmUso[]`) com `{fluxo, modelo, custoEstimado (já calculado em porFluxoModelo), metrica: nome, valor, fonteUrl}` usando a linha mais recente de cada `metrica` nomeada encontrada. Sem benchmark pra aquele `{fluxo, modelo}`, não entra no array (degradação graciosa).

**Acceptance criteria:**
- [x] `metrica3` tem uma entrada por `{fluxo, modelo, metrica}` onde existe benchmark cadastrado
- [x] `{fluxo, modelo}` sem benchmark cadastrado não aparece em `metrica3`
- [x] Múltiplas métricas nomeadas pro mesmo `{fluxo, modelo}` geram uma entrada por métrica

**Verification:**
- [x] `npm test -- tests/relatorios/usoIa.test.ts`
- [x] `npm run build`

**Dependencies:** None (usa `listarBenchmarks`, já existente desde a Tarefa 31)

**Files likely touched:**
- `src/relatorios/usoIa.ts`
- `tests/relatorios/usoIa.test.ts`

**Estimated scope:** Small (1 arquivo de código + teste)

---

### Tarefa 37: `formatarRelatorio` — exibir Métrica 3

**Description:** Na seção "Uso de IA" do texto do relatório, depois da Métrica 1 existente, adiciona uma linha por entrada de `metrica3`: custo real do período naquele fluxo junto com o valor do benchmark do modelo em uso (ex: `- conversa_texto (openai/gpt-4o-mini): US$ 0,002341 no período — acuracia_tool_calling: 100% (fonte: interno)`). Sem nenhuma entrada em `metrica3`, a seção inteira não aparece (mesma regra de degradação graciosa da Métrica 1).

**Acceptance criteria:**
- [x] Relatório com `metrica3` não vazio mostra a nova seção com custo real + valor de benchmark por linha
- [x] Relatório com `metrica3` vazio não mostra a seção (sem texto vazio nem cabeçalho solto)

**Verification:**
- [x] `npm test -- tests/relatorios/formatar.test.ts`
- [x] `npm run build`

**Dependencies:** Tarefa 36

**Files likely touched:**
- `src/relatorios/formatar.ts`
- `tests/relatorios/formatar.test.ts`

**Estimated scope:** Small (1 arquivo de código + teste)

## Checkpoint: Métrica 3 funcional
- [x] `npm run build`/`lint`/`test` sem erro (493/493 em `development`)
- [x] Teste manual em Homologação: pedir `relatorio` (período com uso real de `conversa_texto`) via Telegram real e confirmar que a seção da Métrica 3 aparece com o benchmark real (`acuracia_tool_calling`) já cadastrado na Tarefa 35

## Fase P: Métrica 2

### Tarefa 38: `agregarUsoIaPeriodo` — calcular fator de acurácia relativo (Métrica 2)

**Description:** Reaproveitando o lookup da Tarefa 36 (benchmark do modelo real em uso por fluxo), calcula pra cada candidato de referência (mesmo conjunto de `metrica1`) que tenha benchmark da **mesma métrica nomeada** pro **mesmo fluxo**: `fator = valorModeloEmUso / valorCandidato`, `custoAjustado = (tokensDoFluxoNoPeríodo × precoDoCandidato) × fator`. Expõe no retorno (`metrica2: MetricaAjustadaPorFluxo[]`) com `{fluxo, nomeExibicaoCandidato, modelo, metrica: nome, custoAjustado}`. Sem par comparável (mesma métrica nos dois lados), não gera entrada pra aquele `{fluxo, candidato}` — cai de volta pra só Métrica 1 (já existente, inalterada).

**Acceptance criteria:**
- [x] Fluxo/candidato com benchmark da mesma métrica nos dois lados gera entrada em `metrica2` com o fator aplicado corretamente
- [x] Fluxo/candidato sem benchmark comparável (métrica nomeada diferente, ou só um lado tem benchmark) não gera entrada
- [x] `metrica1` continua exatamente como está hoje (não alterada por esta tarefa)

**Verification:**
- [x] `npm test -- tests/relatorios/usoIa.test.ts`
- [x] `npm run build`

**Dependencies:** Tarefa 36

**Files likely touched:**
- `src/relatorios/usoIa.ts`
- `tests/relatorios/usoIa.test.ts`

**Estimated scope:** Small (1 arquivo de código + teste)

---

### Tarefa 39: `formatarRelatorio` — exibir Métrica 2

**Description:** Na seção "Uso de IA", junto da comparação hipotética da Métrica 1 já existente, adiciona (quando houver `metrica2` pro candidato) o custo ajustado pelo fator de acurácia, rotulado como estimativa (ex: `- Claude Sonnet 4.5: US$ 0,004102 (ajustado por acuracia_tool_calling — estimativa)`, ao lado da linha já existente da Métrica 1 pro mesmo candidato). Sem `metrica2` pro candidato/fluxo, mostra só a linha da Métrica 1 já existente (sem alteração).

**Acceptance criteria:**
- [x] Candidato com `metrica2` disponível mostra a linha ajustada além da linha de Métrica 1
- [x] Candidato sem `metrica2` mostra só a linha de Métrica 1 (comportamento atual preservado)

**Verification:**
- [x] `npm test -- tests/relatorios/formatar.test.ts`
- [x] `npm run build`

**Dependencies:** Tarefa 38, Tarefa 37 (mesma seção do relatório)

**Files likely touched:**
- `src/relatorios/formatar.ts`
- `tests/relatorios/formatar.test.ts`

**Estimated scope:** Small (1 arquivo de código + teste)

## Checkpoint: Métrica 2 funcional (Fase 6 parte 3 concluída)
- [x] `npm run build`/`lint`/`test` sem erro
- [x] Teste manual em Homologação: `relatorio(periodo=...)` no mesmo período mostra a Métrica 2 ajustada pro(s) candidato(s) comparáveis contra o modelo real em uso em `conversa_texto`
- [x] PROGRESSO.md atualizado com o marco "Fase 6 (parte 3) concluída"

## Fase Q: Seed de casos de teste curados

### Tarefa 40: script de seed com casos de teste fixos pro benchmark interno

**Description:** Novo `src/scripts/seedCasosTesteBenchmarkCurados.ts` (padrão dos outros scripts, com guard de execução direta) — lista fixa de 13 casos (ver `tasks/plan.md`, Fase Q, pra entrada/tool call esperado de cada um) cobrindo tarefas básicas, as mais usadas (dado real de `interacoes_ia`) e as de maior impacto financeiro (`requerConfirmacao: true`). Usa `criarCasoTeste(db, {fluxo: 'conversa_texto', entrada, saidaEsperada, origem: 'curado'})` (Tarefa 31, já existe). Roda uma vez por ambiente (Homologação e, quando promovido, Produção); idempotente — pula caso cuja `entrada` já existe pro fluxo, não duplica ao rodar de novo.

**Acceptance criteria:**
- [ ] Rodar o script numa base vazia cria as 13 linhas em `casos_teste_benchmark` com `origem: 'curado'`
- [ ] Rodar o script de novo (mesma base) não duplica nenhuma linha (idempotente por `entrada`)
- [ ] Nenhum dos 13 casos depende de contexto de turno anterior (todos autocontidos)

**Verification:**
- [ ] `npm test -- tests/scripts/seedCasosTesteBenchmarkCurados.test.ts`
- [ ] `npm run build`
- [ ] Manual: rodar o script em Homologação (`node dist/scripts/seedCasosTesteBenchmarkCurados.js`), confirmar as 13 linhas via consulta direta ao banco, e rodar `rodar_benchmark_interno` comparando 2 modelos reais contra o conjunto novo

**Dependencies:** None (usa `criarCasoTeste`/`listarCasosTeste`, já existentes desde a Tarefa 31)

**Files likely touched:**
- `src/scripts/seedCasosTesteBenchmarkCurados.ts`
- `tests/scripts/seedCasosTesteBenchmarkCurados.test.ts`

**Estimated scope:** Small (1 arquivo de código + teste, sem mudança de schema)

## Checkpoint: Seed de casos curados funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: script rodado, 13 casos confirmados no banco, `rodar_benchmark_interno` executado com sucesso contra o conjunto novo
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)
