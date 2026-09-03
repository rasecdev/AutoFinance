# Tarefas: Fase 4 — Contexto e memória de conversa

> Ver `tasks/plan.md` para o grafo de dependência completo e as decisões de arquitetura. Fluxo de trabalho (branch/PR/merge) conforme `CLAUDE.md`.

## Fase E: Persistência de histórico

### Tarefa 17: Migração de histórico por chat + repositório de leitura ✅

**Implementado:** conforme descrito abaixo, sem desvios do planejado.

**Descrição:** Nova migração adicionando `chat_id`, `tokens_prompt`, `tokens_completion` em `interacoes_ia` (colunas nullable, sem preencher histórico antigo) e a tabela `resumos_conversa` (`id, chat_id, resumo_texto, cobre_ate_trace_id, tokens_janela_no_gatilho, criado_em`, conforme PLANO.md linha 518). Estender `src/db/repositories/interacoesIa.ts` com funções de leitura: buscar últimas N interações de um `chat_id` (ordenadas cronologicamente, com filtro opcional "depois de um `trace_id`"), e somar `tokens_prompt + tokens_completion` de um chat desde um `trace_id` (ou desde o início, se omitido). `registrarInteracaoIa` passa a aceitar `chatId`, `tokensPrompt`, `tokensCompletion` opcionais.

**Acceptance criteria:**
- [x] Migração roda limpo em banco novo (`migrate()` do zero) e em banco já existente com dados da Fase 3 (linhas antigas de `interacoes_ia` ficam com `chat_id`/tokens `NULL`, sem erro)
- [x] Existe uma função que retorna as últimas N interações de um `chat_id`, em ordem cronológica
- [x] Existe uma função que soma tokens (`tokens_prompt + tokens_completion`) de um `chat_id`, opcionalmente a partir de um `trace_id`

**Verification:**
- [x] `npm test` cobre a migração (idempotência/coluna nova) e as duas funções de leitura novas — 330/330 (1 falha em `dividas.test.ts` isolada por timeout de hook, confirmada flaky ao rodar o arquivo sozinho, sem relação com esta tarefa)
- [x] `npm run build`/`lint` sem erro

**Dependencies:** None

**Files likely touched:**
- `src/db/migrations/000X_historico_conversa.sql` (novo)
- `src/db/repositories/interacoesIa.ts`
- `tests/db/interacoesIa.test.ts`

**Estimated scope:** Small (2-3 arquivos)

---

### Tarefa 18: Repositório `resumos_conversa` ✅

**Implementado:** conforme descrito abaixo, sem desvios do planejado.

**Descrição:** `src/db/repositories/resumosConversa.ts` (novo): `criarResumoConversa(db, { chatId, resumoTexto, cobreAteTraceId, tokensJanelaNoGatilho })` (insert) e `obterUltimoResumo(db, chatId)` (último resumo daquele chat, por `criado_em` desc, ou `undefined` se nunca houve um).

**Acceptance criteria:**
- [x] É possível criar um resumo associado a um chat e recuperar o mais recente
- [x] Um chat sem resumo nenhum retorna `undefined` (não lança erro)

**Verification:**
- [x] `npm test` cobre criação e recuperação do último resumo, incluindo o caso "nenhum resumo ainda" — 334 testes no total (4 novos), 4 falhas de timeout de hook em arquivos não relacionados durante a rodada completa, confirmadas flaky (passam isoladamente, mesmo padrão de sobrecarga sob paralelismo já visto na Tarefa 17)
- [x] `npm run build`/`lint` sem erro

**Dependencies:** Tarefa 17 (schema de `resumos_conversa`)

**Files likely touched:**
- `src/db/repositories/resumosConversa.ts` (novo)
- `tests/db/resumosConversa.test.ts` (novo)

**Estimated scope:** Small (2 arquivos)

---

## Checkpoint: Fundação de memória
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Migração roda limpo em banco novo e em banco existente (sem perda de dado)
- [ ] Revisão com o usuário antes de prosseguir

---

## Fase F: Injeção de contexto na conversa

### Tarefa 19: Montagem do prompt com resumo + janela curta ✅

**Implementado:** conforme descrito abaixo, sem desvios do planejado. `montarHistorico` monta um `system` extra com o resumo (se existir) seguido dos pares `user`/`assistant` das interações do chat depois do `cobre_ate_trace_id` do resumo (ou as últimas `LIMITE_TURNOS_JANELA = 12`, sem resumo). `gerarResposta` ganhou um 5º parâmetro opcional `historico` (default `[]`, mantém 100% de compatibilidade com chamadas existentes), injetado entre o system prompt e a mensagem atual.

**Descrição:** Novo módulo `src/ai/contexto.ts`: `montarHistorico(db, chatId)` retorna o array de mensagens (`role: 'assistant'`/`'user'`) a injetar entre o system prompt e a mensagem atual — busca `obterUltimoResumo`, injeta como uma mensagem `system` adicional (bloco fixo, resumo da conversa até aqui) se existir, e busca as últimas N interações do chat **depois** do `cobre_ate_trace_id` do resumo (ou as últimas N, se não houver resumo) como pares `user`/`assistant` verbatim. `gerarResposta` (`src/ai/openrouter.ts`) passa a aceitar `chatId` e usar `montarHistorico` pra montar `mensagens` antes da chamada. `handlerTexto` passa a chamar `registrarInteracaoIa` com `chatId` e os tokens retornados pela chamada (hoje descartados — conferir se `gerarResposta` já retorna `usage`, senão expor).

**Acceptance criteria:**
- [x] Uma segunda mensagem no mesmo chat inclui as mensagens anteriores daquele chat no prompt enviado ao modelo
- [x] Chat sem histórico anterior (primeira mensagem) monta o prompt exatamente como hoje (system + mensagem atual, sem quebrar o comportamento existente)
- [x] `interacoes_ia.chat_id`/`tokens_prompt`/`tokens_completion` são gravados em toda chamada nova

**Verification:**
- [x] `npm test` cobre: histórico vazio (comportamento inalterado), histórico com resumo, histórico sem resumo (só janela), isolamento entre chats, injeção real de ponta a ponta via `handlerTexto` (duas mensagens seguidas no mesmo chat) — 340/340 em `development`
- [x] `npm run build`/`lint` sem erro
- [x] Manual em Homologação: perguntar algo, depois fazer uma pergunta de seguimento ("e comparado ao mês passado?") e confirmar que o bot responde corretamente usando o contexto do turno anterior — verificado via Telegram real, deploy direto na VM (branch da tarefa, antes do merge): "Quanto gastei em março na conta Testes?" → "e na conta Poupança?" respondido corretamente como continuação de março, sem o usuário repetir o mês; `chat_id`/`tokens_prompt`/`tokens_completion` conferidos em `interacoes_ia`

**Dependencies:** Tarefa 17, Tarefa 18

**Files likely touched:**
- `src/ai/contexto.ts` (novo)
- `src/ai/openrouter.ts`
- `src/bot/handlers/texto.ts`
- `tests/ai/contexto.test.ts` (novo)

**Estimated scope:** Medium (4 arquivos)

---

### Tarefa 20: Fluxo `resumir_contexto` + gatilho automático ✅

**Implementado:** conforme descrito abaixo, sem desvios do planejado. `LIMITE_TOKENS_JANELA = 6000` como constante ajustável (ponto de partida do PLANO.md); `MODELO_RESUMO` isolado do `MODELO_PADRAO`, ainda sem `roteamento_tarefas` (Fase 5). `verificarGatilhoResumo` roda em `texto.ts` logo depois de `ctx.reply(...)`, dentro de um `try/catch` próprio — uma falha ao gerar o resumo é logada mas nunca derruba a resposta já enviada ao usuário.

**Descrição:** `src/ai/resumirContexto.ts` (novo): `resumirContexto(client, { resumoAnterior, mensagensNovas })` — chamada de IA dedicada (`MODELO_RESUMO`, constante própria), prompt específico instruído a reter decisões/valores/pendências e descartar o literal de lançamento de dado já persistido no banco; registra a chamada em `uso_tokens` (fluxo `'resumir_contexto'`) e em `interacoes_ia` do mesmo jeito que qualquer outra chamada. Em `handlerTexto`, depois de responder ao usuário: soma tokens do chat desde o último resumo (repositório da Tarefa 17); se ultrapassar `LIMITE_TOKENS_JANELA` (constante, ex. 6000), dispara `resumirContexto` com o resumo anterior (se houver) + as interações da janela, e grava o resultado via `criarResumoConversa` com `cobreAteTraceId` apontando pro `trace_id` mais recente incluído no resumo.

**Acceptance criteria:**
- [x] Existe uma chamada de IA isolada que gera resumo cumulativo (resumo anterior + mensagens novas, nunca reprocessando a conversa inteira)
- [x] O disparo do resumo acontece depois de a resposta já ter sido enviada ao usuário (não adiciona latência perceptível à resposta atual)
- [x] Resumo novo substitui efetivamente a janela antiga nas chamadas seguintes (Tarefa 19 volta a buscar o resumo mais recente)

**Verification:**
- [x] `npm test` cobre: geração de resumo cumulativo (com e sem resumo anterior), disparo do gatilho ao ultrapassar o limite, não-disparo abaixo do limite, isolamento entre chats, registro em `interacoes_ia`/`uso_tokens` com o fluxo `resumir_contexto` — 346/346 em `development`
- [x] `npm run build`/`lint` sem erro
- [x] Manual em Homologação: conversa longa o bastante pra ultrapassar o limite de tokens, conferir `resumos_conversa` populado e que uma pergunta de seguimento depois do resumo ainda funciona corretamente — verificado via Telegram real, deploy direto na VM (branch da tarefa, antes do merge): mecanismo disparou corretamente (`resumos_conversa` populado, resumo cumulativo fundindo o anterior com as mensagens novas, `interacoes_ia`/`uso_tokens` registrando o fluxo `resumir_contexto` separado de `conversa_texto`). **Achado de calibração, corrigido na hora**: `LIMITE_TOKENS_JANELA` original (6000, ponto de partida do PLANO.md) disparava o resumo em praticamente toda mensagem — uma única chamada de conversa já custa ~11-18k tokens sozinha (system prompt + ~20 definições de ferramentas dominam o custo fixo), nunca deixando a janela curta acumular turno nenhum antes de resumir. Ajustado pra 25000 (decisão do usuário) — permite acumular 1-2 trocas reais antes do gatilho, redeployado e testado de novo na mesma sessão

**Dependencies:** Tarefa 19

**Files likely touched:**
- `src/ai/resumirContexto.ts` (novo)
- `src/bot/handlers/texto.ts`
- `tests/ai/resumirContexto.test.ts` (novo)

**Estimated scope:** Medium (3 arquivos)

---

## Checkpoint: Memória funcional
- [ ] Testar manualmente em Homologação: pergunta de seguimento sem repetir contexto ("e comparado ao mês passado?"), e uma conversa longa o bastante pra disparar o resumo automático — conferir `resumos_conversa` no banco
- [ ] `npm test` passa
- [ ] Revisão com o usuário antes de prosseguir

---

## Fase G: Troca de modelo

### Tarefa 21: Comando `/modelo <nome>`

**Descrição:** `src/bot/modeloAtivo.ts` (novo): `Map<chatId, string>` em memória (mesmo padrão de `contextoRecente.ts`), `definirModeloAtivo`/`obterModeloAtivo` (retorna `MODELO_PADRAO` se não houver override). `src/bot/handlers/modelo.ts` (novo, `createHandlerModelo`): `/modelo <nome>` define o override e confirma; `/modelo` sem argumento responde qual o modelo ativo naquele chat. `router.ts` ganha uma nova rota (mesmo padrão do `/errado`: regex case-insensitive `/^\/modelo\b/i`, `bot.on('message:text').filter(...)`, registrada antes do `handlerTexto`). `handlerTexto`/`gerarResposta` passam a usar `obterModeloAtivo(chatId)` em vez do `MODELO_PADRAO` fixo na chamada principal (fluxo `resumir_contexto` da Tarefa 20 continua sempre no `MODELO_RESUMO`, não é afetado pelo override).

**Acceptance criteria:**
- [ ] `/modelo <nome>` troca o modelo usado nas próximas chamadas daquele chat, sem afetar outros chats
- [ ] `/modelo` sem argumento informa o modelo ativo (padrão ou sobrescrito)
- [ ] `interacoes_ia.modelo` reflete o modelo realmente usado após a troca

**Verification:**
- [ ] `npm test` cobre: troca de modelo, consulta sem argumento, isolamento entre chats diferentes
- [ ] `npm run build`/`lint` sem erro
- [ ] Manual em Homologação: `/modelo <algum modelo válido do OpenRouter>`, mandar uma mensagem e conferir em `interacoes_ia.modelo` que o modelo novo foi de fato usado

**Dependencies:** Tarefa 2 (uso_tokens/interacoes_ia já gravam `modelo` desde a Fase 3)

**Files likely touched:**
- `src/bot/modeloAtivo.ts` (novo)
- `src/bot/handlers/modelo.ts` (novo)
- `src/bot/router.ts`
- `src/bot/bot.ts`
- `src/index.ts`
- `tests/bot/modeloAtivo.test.ts` (novo)
- `tests/bot/modelo.test.ts` (novo)

**Estimated scope:** Medium (5 arquivos, mesmo padrão do `/errado` na Tarefa 16)

---

## Checkpoint: Fase 4 completa
- [ ] Todos os critérios de aceite das Tarefas 17-21 atendidos
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: trocar de modelo via `/modelo`, confirmar que a próxima resposta usa o modelo novo (`interacoes_ia.modelo`)
- [ ] PROGRESSO.md atualizado com o marco "Fase 4 concluída"
- [ ] Revisão com o usuário antes de prosseguir para a Fase 5
