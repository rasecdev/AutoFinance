# Tarefas: Fase 6 (parte 2) — Benchmark interno (tool calling)

> Ver `tasks/plan.md` para o grafo de dependência completo e as decisões de arquitetura. Fluxo de trabalho (branch/PR/merge) conforme `CLAUDE.md`.

## Fase M: Fundação de dados

### Tarefa 31: Tabelas `casos_teste_benchmark` e `benchmarks_modelos` + repositórios

**Descrição:** Duas migrações novas. `src/db/migrations/000X_casos_teste_benchmark.sql`: `casos_teste_benchmark (id, fluxo, entrada, saida_esperada TEXT — JSON de `Array<{nome, argumentos}>`, origem TEXT CHECK IN ('curado', 'derivado_correcao'), criado_em)`. `src/db/migrations/000X_benchmarks_modelos.sql`: `benchmarks_modelos (id, fluxo, model_id_openrouter, metrica, valor REAL, fonte_url, data_pesquisa)` — schema já especificado no PLANO.md (linha 233), nasce vazia. `src/db/repositories/casosTesteBenchmark.ts` (novo): `criarCasoTeste(db, { fluxo, entrada, saidaEsperada, origem })`, `listarCasosTeste(db, fluxo)`. `src/db/repositories/benchmarksModelos.ts` (novo): `registrarBenchmark(db, { fluxo, modelIdOpenrouter, metrica, valor, fonteUrl })` (grava `data_pesquisa` internamente, mesmo padrão de `registrarSnapshotModelo`), `listarBenchmarks(db, fluxo, modelIdOpenrouter)`.

**Acceptance criteria:**
- [ ] `casos_teste_benchmark` e `benchmarks_modelos` existem, ambas nascem vazias
- [ ] `criarCasoTeste`/`listarCasosTeste` funcionam, `saida_esperada` serializa/deserializa como JSON corretamente
- [ ] `registrarBenchmark`/`listarBenchmarks` funcionam, `data_pesquisa` gravada automaticamente

**Verification:**
- [ ] `npm test` cobre: criar/listar caso de teste (com JSON de tool_calls), criar/listar benchmark, filtro por fluxo/modelo não mistura dados
- [ ] `npm run build`/`lint` sem erro

**Dependencies:** None

**Files likely touched:**
- `src/db/migrations/000X_casos_teste_benchmark.sql` (novo)
- `src/db/migrations/000X_benchmarks_modelos.sql` (novo)
- `src/db/repositories/casosTesteBenchmark.ts` (novo)
- `src/db/repositories/benchmarksModelos.ts` (novo)
- `tests/db/casosTesteBenchmark.test.ts` (novo)
- `tests/db/benchmarksModelos.test.ts` (novo)
- `tests/db/migrate.test.ts` (lista de tabelas esperadas)

**Estimated scope:** Medium (7 arquivos)

---

## Checkpoint: Fundação testada
- [ ] `npm run build`/`lint`/`test` sem erro

---

## Fase N: Curadoria e execução

### Tarefa 32: Tool `criar_caso_teste_benchmark`

**Descrição:** Nova função em `src/db/repositories/interacoesIa.ts`: `buscarUltimaInteracaoCorreta(db, chatId)` — última linha com `avaliacao_usuario = 'correto'` naquele chat, retornando `traceId`, `mensagemUsuario` e `toolCalls` (parse do JSON já gravado em `tool_calls`). `src/ai/tools/benchmark.ts` (novo): `criarToolCriarCasoTesteBenchmark(db)` — `criar_caso_teste_benchmark()`, sem parâmetro (mesmo princípio de "editar essa transação" — regra 8 do system prompt: resolve pra última coisa relevante sem pedir id). Resolve a última interação correta do chat, usa `mensagemUsuario` como `entrada` e `toolCalls` como `saidaEsperada`, grava com `origem: 'derivado_correcao'`. Sem interação correta ainda registrada nesse chat, devolve mensagem clara em vez de erro/exceção. Registrada em `texto.ts` junto das outras ferramentas.

**Acceptance criteria:**
- [ ] `criar_caso_teste_benchmark()` promove a última interação `avaliacao_usuario = 'correto'` do chat em `casos_teste_benchmark`, com `origem = 'derivado_correcao'`
- [ ] Sem nenhuma interação correta no chat, devolve mensagem informativa (não lança erro)
- [ ] Não confunde interação correta de chats diferentes

**Verification:**
- [ ] `npm test` cobre: promoção da última interação correta, chat sem interação correta, múltiplos chats não se misturam, interação sem `tool_calls` (mensagem só de texto, sem chamada de ferramenta) tratada corretamente
- [ ] `npm run build`/`lint` sem erro
- [ ] Manual em Homologação: marcar uma resposta recente como correta (feedback já existente, Fase 4), pedir "salva isso como caso de teste", conferir linha nova em `casos_teste_benchmark`

**Dependencies:** Tarefa 31

**Files likely touched:**
- `src/db/repositories/interacoesIa.ts`
- `src/ai/tools/benchmark.ts` (novo)
- `src/bot/handlers/texto.ts`
- `tests/db/interacoesIa.test.ts`
- `tests/ai/tools/benchmark.test.ts` (novo)

**Estimated scope:** Medium (5 arquivos)

---

### Tarefa 33: Motor de execução do benchmark interno

**Descrição:** `src/ai/tools/conversaTools.ts` (novo): `montarToolsConversa(db): ToolDefinition[]` — extrai o array de ferramentas hoje montado inline em `createHandlerTexto` (`texto.ts`), sem mudar nenhuma ferramenta em si, só torna reaproveitável. `texto.ts` passa a chamar essa função. `src/ai/benchmark.ts` (novo): `executarBenchmarkFluxo(client, db, fluxo, modelosCandidatos: string[])` — pra cada modelo candidato, pra cada caso de `listarCasosTeste(db, fluxo)`, faz **uma chamada de completion não-executora** (system prompt + `montarToolsConversa(db)` + `entrada` do caso como única mensagem, `tool_choice: 'auto'`, sem loop, **nunca chama `tool.handler`**), extrai `tool_calls` da resposta, compara com `saidaEsperada` (comparação estrutural: mesmo conjunto de `{nome, argumentos}`, chaves de `argumentos` normalizadas antes de comparar — evita falso negativo por ordem de chave no JSON). Acumula acerto/total por modelo (acurácia), registra o custo de cada chamada via `registrarUsoTokens` com `origem: 'benchmark_interno'` (nunca `'uso_real'` — Tarefa 27 já filtra isso fora do relatório). Retorna, por modelo candidato: `{ modelo, acuracia, totalCasos, custoTotal }` — não grava em `benchmarks_modelos` ainda (isso é a Tarefa 34, que decide o rótulo/metrica e expõe no chat).

**Acceptance criteria:**
- [ ] Nunca executa `tool.handler` de verdade — só inspeciona `tool_calls` da resposta do modelo candidato
- [ ] Compara `tool_calls` do candidato com `saida_esperada` corretamente, incluindo quando a ordem das chaves do JSON de argumentos é diferente (mesmo conteúdo, ordem diferente = ainda considerado igual)
- [ ] Calcula acurácia (acertos/total) por modelo candidato, sobre todos os casos do fluxo
- [ ] Custo de cada chamada de teste é registrado em `uso_tokens` com `origem = 'benchmark_interno'`, nunca `'uso_real'`
- [ ] Fluxo sem nenhum caso de teste cadastrado devolve resultado vazio/claro, sem lançar erro

**Verification:**
- [ ] `npm test` cobre: acerto exato, erro de tool (nome errado), erro de parâmetro, argumentos com chaves em ordem diferente ainda batendo, múltiplos casos/múltiplos modelos, registro em `uso_tokens` com a origem certa, fluxo sem caso de teste
- [ ] `npm run build`/`lint` sem erro

**Dependencies:** Tarefa 31

**Files likely touched:**
- `src/ai/tools/conversaTools.ts` (novo)
- `src/bot/handlers/texto.ts`
- `src/ai/benchmark.ts` (novo)
- `tests/ai/tools/conversaTools.test.ts` (novo)
- `tests/ai/benchmark.test.ts` (novo)

**Estimated scope:** Medium (5 arquivos)

---

### Tarefa 34: Tool `rodar_benchmark_interno(fluxo, modelos_candidatos)`

**Descrição:** `src/ai/tools/benchmark.ts` (extende a Tarefa 32): `criarToolRodarBenchmarkInterno(client, db)` — `rodar_benchmark_interno(fluxo, modelos_candidatos: string[])`, `requerConfirmacao: true` (custa dinheiro real — N casos × M modelos, uma chamada cada), `avisoConfirmacao` mostra quantas chamadas reais a rodada vai fazer (`casos.length * modelosCandidatos.length`) antes da confirmação. Ao confirmar, chama `executarBenchmarkFluxo` (Tarefa 33) e, pra cada modelo candidato, grava o resultado via `registrarBenchmark(db, { fluxo, modelIdOpenrouter: modelo, metrica: 'acuracia_tool_calling', valor: acuracia, fonteUrl: 'interno' })`. Resposta final lista acurácia e custo por modelo candidato. Registrada em `texto.ts`.

**Acceptance criteria:**
- [ ] Exige confirmação antes de rodar, mostrando quantas chamadas reais serão feitas
- [ ] Ao confirmar, roda o benchmark e grava um resultado por modelo candidato em `benchmarks_modelos`, com `fonte_url = 'interno'`
- [ ] Resposta final mostra acurácia e custo por modelo candidato

**Verification:**
- [ ] `npm test` cobre: pedido de confirmação com contagem certa de chamadas, gravação de um resultado por modelo candidato após confirmar, `fonte_url = 'interno'` sempre
- [ ] `npm run build`/`lint` sem erro
- [ ] Manual em Homologação: com pelo menos 1 caso de teste já curado (Tarefa 32), pedir "roda o benchmark de tool calling comparando openai/gpt-4o-mini e qwen/qwen3-32b", confirmar, conferir `benchmarks_modelos` com 2 linhas novas e custo do teste em `uso_tokens` (`origem = benchmark_interno`)

**Dependencies:** Tarefa 31, Tarefa 33

**Files likely touched:**
- `src/ai/tools/benchmark.ts`
- `src/bot/handlers/texto.ts`
- `tests/ai/tools/benchmark.test.ts`

**Estimated scope:** Small (3 arquivos)

---

## Checkpoint: Benchmark interno funcional
- [ ] Todos os critérios de aceite das Tarefas 31-34 atendidos
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: curar pelo menos 1 caso real de tool calling, rodar o benchmark comparando pelo menos 2 modelos, confirmar resultado em `benchmarks_modelos` com valor plausível e custo do teste visível em `uso_tokens` (`origem = benchmark_interno`)
- [ ] PROGRESSO.md atualizado com o marco "Fase 6 (parte 2) concluída"
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)
