# Tarefas: Fase 6 (parte 2) — Benchmark interno (tool calling)

> Ver `tasks/plan.md` para o grafo de dependência completo e as decisões de arquitetura. Fluxo de trabalho (branch/PR/merge) conforme `CLAUDE.md`.

## Fase M: Fundação de dados

### Tarefa 31: Tabelas `casos_teste_benchmark` e `benchmarks_modelos` + repositórios ✅

**Implementado:** conforme descrito, sem desvios do planejado. `src/db/migrations/0006_casos_teste_benchmark.sql` e `0007_benchmarks_modelos.sql` (novas, nascem vazias). `src/db/repositories/casosTesteBenchmark.ts` (`criarCasoTeste`/`listarCasosTeste`, `saidaEsperada` serializada como JSON) e `src/db/repositories/benchmarksModelos.ts` (`registrarBenchmark`/`listarBenchmarks`, `dataPesquisa` gravada automaticamente, mesmo padrão de `registrarSnapshotModelo`).

**Descrição:** Duas migrações novas. `src/db/migrations/000X_casos_teste_benchmark.sql`: `casos_teste_benchmark (id, fluxo, entrada, saida_esperada TEXT — JSON de `Array<{nome, argumentos}>`, origem TEXT CHECK IN ('curado', 'derivado_correcao'), criado_em)`. `src/db/migrations/000X_benchmarks_modelos.sql`: `benchmarks_modelos (id, fluxo, model_id_openrouter, metrica, valor REAL, fonte_url, data_pesquisa)` — schema já especificado no PLANO.md (linha 233), nasce vazia. `src/db/repositories/casosTesteBenchmark.ts` (novo): `criarCasoTeste(db, { fluxo, entrada, saidaEsperada, origem })`, `listarCasosTeste(db, fluxo)`. `src/db/repositories/benchmarksModelos.ts` (novo): `registrarBenchmark(db, { fluxo, modelIdOpenrouter, metrica, valor, fonteUrl })` (grava `data_pesquisa` internamente, mesmo padrão de `registrarSnapshotModelo`), `listarBenchmarks(db, fluxo, modelIdOpenrouter)`.

**Acceptance criteria:**
- [x] `casos_teste_benchmark` e `benchmarks_modelos` existem, ambas nascem vazias
- [x] `criarCasoTeste`/`listarCasosTeste` funcionam, `saida_esperada` serializa/deserializa como JSON corretamente
- [x] `registrarBenchmark`/`listarBenchmarks` funcionam, `data_pesquisa` gravada automaticamente

**Verification:**
- [x] `npm test` cobre: criar/listar caso de teste (com JSON de tool_calls), criar/listar benchmark, filtro por fluxo/modelo não mistura dados — 460/460 em `development`
- [x] `npm run build`/`lint` sem erro

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
- [x] `npm run build`/`lint`/`test` sem erro (460/460 em `development`, confirmado após a Tarefa 31)

---

## Fase N: Curadoria e execução

### Tarefa 32: Comando `/certo` ✅

**Implementado:** conforme descrito, sem desvios do planejado. `createHandlerFeedback(db, logger, avaliacao)` generalizado, mensagens ajustadas por parâmetro (pequena imperfeição de concordância de gênero aceita conscientemente — "responda... como incorreto" em vez de "incorreta" — não vale a complexidade de mapear forma feminina/masculina pra um enum de 2 valores). `router.ts` ganha `COMANDO_CERTO` e `handlerFeedbackCorreto`, registrado entre `/errado` e `/modelo`. `bot.ts`/`index.ts` passam a instanciar e encadear os dois handlers de feedback.

**Achado real ao planejar a Tarefa 33 original** (antes de escrever qualquer código dela): nada no código hoje jamais grava `avaliacao_usuario = 'correto'` em `interacoes_ia` — `atualizarAvaliacaoInteracao` só é chamada por `handlerFeedback`/`/errado`, sem nenhuma contraparte positiva. O PLANO.md pressupõe "interações já marcadas `avaliacao_usuario = correto`" como gabarito pronto de usar, mas isso nunca existiu de fato. Sem essa tarefa, a Tarefa 33 (curadoria) não teria nenhum dado real pra resolver.

**Descrição:** `src/bot/handlers/feedback.ts`: `createHandlerFeedback(db, logger, avaliacao: AvaliacaoUsuario)` — generaliza o handler existente pra aceitar a avaliação como parâmetro (mensagens de aviso/confirmação ajustadas conforme `avaliacao`), reaproveitando o mesmo rastro de `trace_id` por `message_id` (`rastroRespostas.ts`) já usado por `/errado`. `src/bot/router.ts`: novo `COMANDO_CERTO` (mesmo padrão case-insensitive de `COMANDO_ERRADO`), roteando pra uma segunda instância do handler. `src/index.ts`: instancia `createHandlerFeedback(db, logger, 'correto')` além da já existente `'incorreto'`, passa as duas pro roteador.

**Acceptance criteria:**
- [x] `/certo`, respondendo (reply) a uma mensagem do bot, marca a interação correspondente como `avaliacao_usuario = 'correto'`
- [x] Mesmas mensagens de erro de `/errado` (sem reply, rastro não encontrado), adaptadas pro contexto de `/certo`
- [x] `/errado` continua funcionando exatamente como antes (nenhuma regressão)

**Verification:**
- [x] `npm test` cobre: `/certo` marca como correto, mesmos casos de erro de `/errado` adaptados, roteamento reconhece `/certo` case-insensitive sem quebrar o roteamento de `/errado` — 464/464 em `development`
- [x] `npm run build`/`lint` sem erro
- [x] Manual em Homologação: responder a uma mensagem do bot com `/certo`, conferir `avaliacao_usuario = 'correto'` na interação — confirmado (fechado junto do teste manual da Tarefa 33)

**Dependencies:** None

**Files likely touched:**
- `src/bot/handlers/feedback.ts`
- `src/bot/router.ts`
- `src/index.ts`
- `tests/bot/feedback.test.ts`
- `tests/bot/router.test.ts`

**Estimated scope:** Medium (5 arquivos)

---

### Tarefa 33: Tool `criar_caso_teste_benchmark` ✅

**Implementado:** conforme descrito, sem desvios do planejado. `buscarUltimaInteracaoCorreta(db, chatId)` nova em `interacoesIa.ts`. `criarToolCriarCasoTesteBenchmark(db)` em `src/ai/tools/benchmark.ts` (novo), registrada em `texto.ts`.

**Descrição:** Nova função em `src/db/repositories/interacoesIa.ts`: `buscarUltimaInteracaoCorreta(db, chatId)` — última linha com `avaliacao_usuario = 'correto'` naquele chat, retornando `traceId`, `mensagemUsuario` e `toolCalls` (parse do JSON já gravado em `tool_calls`). `src/ai/tools/benchmark.ts` (novo): `criarToolCriarCasoTesteBenchmark(db)` — `criar_caso_teste_benchmark()`, sem parâmetro (mesmo princípio de "editar essa transação" — regra 8 do system prompt: resolve pra última coisa relevante sem pedir id). Resolve a última interação correta do chat, usa `mensagemUsuario` como `entrada` e `toolCalls` como `saidaEsperada`, grava com `origem: 'derivado_correcao'`. Sem interação correta ainda registrada nesse chat, devolve mensagem clara em vez de erro/exceção. Registrada em `texto.ts` junto das outras ferramentas.

**Acceptance criteria:**
- [x] `criar_caso_teste_benchmark()` promove a última interação `avaliacao_usuario = 'correto'` do chat em `casos_teste_benchmark`, com `origem = 'derivado_correcao'`
- [x] Sem nenhuma interação correta no chat, devolve mensagem informativa (não lança erro)
- [x] Não confunde interação correta de chats diferentes

**Verification:**
- [x] `npm test` cobre: promoção da última interação correta, chat sem interação correta, múltiplos chats não se misturam, interação sem `tool_calls` (mensagem só de texto, sem chamada de ferramenta) tratada corretamente — 474/474 em `development`
- [x] `npm run build`/`lint` sem erro
- [x] Manual em Homologação: marcar uma resposta recente como correta (`/certo`, Tarefa 32), pedir "salva isso como caso de teste", conferir linha nova em `casos_teste_benchmark` — confirmado via Telegram real: `/certo` marcou a interação "oi" como correta, "Salvar isso como caso de teste de benchmark" chamou `criar_caso_teste_benchmark` corretamente, linha criada com `entrada: "oi"`, `saida_esperada: []`, `origem: derivado_correcao`

**Dependencies:** Tarefa 31, Tarefa 32

**Files likely touched:**
- `src/db/repositories/interacoesIa.ts`
- `src/ai/tools/benchmark.ts` (novo)
- `src/bot/handlers/texto.ts`
- `tests/db/interacoesIa.test.ts`
- `tests/ai/tools/benchmark.test.ts` (novo)

**Estimated scope:** Medium (5 arquivos)

---

### Tarefa 34: Motor de execução do benchmark interno ✅

**Implementado:** conforme descrito, sem desvios do planejado. `montarToolsConversa(db)` extraído pra `src/ai/tools/conversaTools.ts`, `texto.ts` passa a chamá-la. `executarBenchmarkFluxo` em `src/ai/benchmark.ts` (novo) — comparação estrutural com normalização de chave de argumento (`normalizarArgumentos`/`normalizarToolCalls`), nunca chama `tool.handler`.

**Descrição:** `src/ai/tools/conversaTools.ts` (novo): `montarToolsConversa(db): ToolDefinition[]` — extrai o array de ferramentas hoje montado inline em `createHandlerTexto` (`texto.ts`), sem mudar nenhuma ferramenta em si, só torna reaproveitável. `texto.ts` passa a chamar essa função. `src/ai/benchmark.ts` (novo): `executarBenchmarkFluxo(client, db, fluxo, modelosCandidatos: string[])` — pra cada modelo candidato, pra cada caso de `listarCasosTeste(db, fluxo)`, faz **uma chamada de completion não-executora** (system prompt + `montarToolsConversa(db)` + `entrada` do caso como única mensagem, `tool_choice: 'auto'`, sem loop, **nunca chama `tool.handler`**), extrai `tool_calls` da resposta, compara com `saidaEsperada` (comparação estrutural: mesmo conjunto de `{nome, argumentos}`, chaves de `argumentos` normalizadas antes de comparar — evita falso negativo por ordem de chave no JSON). Acumula acerto/total por modelo (acurácia), registra o custo de cada chamada via `registrarUsoTokens` com `origem: 'benchmark_interno'` (nunca `'uso_real'` — Tarefa 27 já filtra isso fora do relatório). Retorna, por modelo candidato: `{ modelo, acuracia, totalCasos, custoTotal }` — não grava em `benchmarks_modelos` ainda (isso é a Tarefa 34, que decide o rótulo/metrica e expõe no chat).

**Acceptance criteria:**
- [x] Nunca executa `tool.handler` de verdade — só inspeciona `tool_calls` da resposta do modelo candidato
- [x] Compara `tool_calls` do candidato com `saida_esperada` corretamente, incluindo quando a ordem das chaves do JSON de argumentos é diferente (mesmo conteúdo, ordem diferente = ainda considerado igual)
- [x] Calcula acurácia (acertos/total) por modelo candidato, sobre todos os casos do fluxo
- [x] Custo de cada chamada de teste é registrado em `uso_tokens` com `origem = 'benchmark_interno'`, nunca `'uso_real'`
- [x] Fluxo sem nenhum caso de teste cadastrado devolve resultado vazio/claro, sem lançar erro

**Verification:**
- [x] `npm test` cobre: acerto exato, erro de tool (nome errado), erro de parâmetro, argumentos com chaves em ordem diferente ainda batendo, múltiplos casos/múltiplos modelos, registro em `uso_tokens` com a origem certa, fluxo sem caso de teste — 483/483 em `development`
- [x] `npm run build`/`lint` sem erro

**Dependencies:** Tarefa 31

**Files likely touched:**
- `src/ai/tools/conversaTools.ts` (novo)
- `src/bot/handlers/texto.ts`
- `src/ai/benchmark.ts` (novo)
- `tests/ai/tools/conversaTools.test.ts` (novo)
- `tests/ai/benchmark.test.ts` (novo)

**Estimated scope:** Medium (5 arquivos)

---

### Tarefa 35: Tool `rodar_benchmark_interno(fluxo, modelos_candidatos)` ✅

**Implementado:** conforme descrito, sem desvios do planejado. `criarToolRodarBenchmarkInterno(client, db)` em `src/ai/tools/benchmark.ts`, `avisoConfirmacao` conta `casos × modelos` (ou avisa quando não há caso de teste pro fluxo). `montarToolsConversa` passa a receber `client` também (usado só por esta tool). `METRICA_ACURACIA_TOOL_CALLING` exportada de `src/ai/benchmark.ts`.

**Descrição:** `src/ai/tools/benchmark.ts` (extende a Tarefa 33): `criarToolRodarBenchmarkInterno(client, db)` — `rodar_benchmark_interno(fluxo, modelos_candidatos: string[])`, `requerConfirmacao: true` (custa dinheiro real — N casos × M modelos, uma chamada cada), `avisoConfirmacao` mostra quantas chamadas reais a rodada vai fazer (`casos.length * modelosCandidatos.length`) antes da confirmação. Ao confirmar, chama `executarBenchmarkFluxo` (Tarefa 34) e, pra cada modelo candidato, grava o resultado via `registrarBenchmark(db, { fluxo, modelIdOpenrouter: modelo, metrica: 'acuracia_tool_calling', valor: acuracia, fonteUrl: 'interno' })`. Resposta final lista acurácia e custo por modelo candidato. Registrada em `texto.ts`.

**Acceptance criteria:**
- [x] Exige confirmação antes de rodar, mostrando quantas chamadas reais serão feitas
- [x] Ao confirmar, roda o benchmark e grava um resultado por modelo candidato em `benchmarks_modelos`, com `fonte_url = 'interno'`
- [x] Resposta final mostra acurácia e custo por modelo candidato

**Verification:**
- [x] `npm test` cobre: pedido de confirmação com contagem certa de chamadas, gravação de um resultado por modelo candidato após confirmar, `fonte_url = 'interno'` sempre — 487/487 em `development`
- [x] `npm run build`/`lint` sem erro
- [x] Manual em Homologação: com pelo menos 1 caso de teste já curado (Tarefa 33), pedir "roda o benchmark de tool calling comparando openai/gpt-4o-mini e qwen/qwen3-32b", confirmar, conferir `benchmarks_modelos` com 2 linhas novas e custo do teste em `uso_tokens` (`origem = benchmark_interno`) — confirmado via Telegram real. **Achado real no primeiro teste, corrigido antes de fechar (mesmo commit):** o modelo tinha invocado `rodar_benchmark_interno` com um `fluxo` inventado (a descrição da comparação, não o identificador `conversa_texto`), e mesmo com 0 casos encontrados o handler ainda gravava "0% de acurácia" em `benchmarks_modelos` — dado enganoso. `fluxo` virou hardcoded (`conversa_texto`, único fluxo desta rodada) e o handler agora recusa rodar sem nenhum caso de teste, mesmo confirmado. Reteste após o fix: aviso mostrou "1 caso × 2 modelos = 2 chamadas", ambos os modelos gravados com `valor: 1` (100%, "oi" não esperava nenhuma ferramenta) e custo real em `uso_tokens` (`openai/gpt-4o-mini`: US$ 0.00093825, `qwen/qwen3-32b`: US$ 0.00131485)

**Dependencies:** Tarefa 31, Tarefa 34

**Files likely touched:**
- `src/ai/tools/benchmark.ts`
- `src/bot/handlers/texto.ts`
- `tests/ai/tools/benchmark.test.ts`

**Estimated scope:** Small (3 arquivos)

---

## Checkpoint: Benchmark interno funcional
- [x] Todos os critérios de aceite das Tarefas 31-35 atendidos
- [x] `npm run build`/`lint`/`test` sem erro (488/488 em `development`)
- [x] Teste manual em Homologação: marcar uma resposta como correta (`/certo`), curar pelo menos 1 caso real de tool calling, rodar o benchmark comparando pelo menos 2 modelos, confirmar resultado em `benchmarks_modelos` com valor plausível e custo do teste visível em `uso_tokens` (`origem = benchmark_interno`)
- [x] PROGRESSO.md atualizado com o marco "Fase 6 (parte 2) concluída"
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)
