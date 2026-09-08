# Tarefas: Fase 6 (parte 5) — `erros_execucao` + alerta de job crítico

Ver `tasks/plan.md` pro desenho completo (decisões de arquitetura, riscos, ordem). Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md` — não repetido aqui.

## Fase R: `erros_execucao` + alerta de job crítico

### Tarefa 41: migração + repositório `erros_execucao`

**Description:** Nova migração `src/db/migrations/0008_erros_execucao.sql` criando a tabela `erros_execucao (id, trace_id nullable, contexto, mensagem, detalhes nullable, data_hora, resolvido)` (ver PLANO.md, "Logs e tratamento de erros", item 3). Novo repositório `src/db/repositories/errosExecucao.ts` com `registrarErro(db, {contexto, mensagem, detalhes?, traceId?})` (grava `resolvido: 0`, `data_hora: new Date().toISOString()`), `listarErros(db, periodo: {inicio, fim})` (retorna linhas ordenadas por `id DESC`, mesma janela em timestamp UTC completo que `interacoes_ia`/`uso_tokens` já usam) e `contarErrosPeriodo(db, periodo: PeriodoRelatorio)` (recebe data pura AAAA-MM-DD, converte internamente pra timestamp UTC completo igual ao helper já existente em `usoIa.ts`, conta linhas).

**Acceptance criteria:**
- [x] `registrarErro` grava uma linha com `data_hora` preenchido e `resolvido: 0`
- [x] `listarErros` retorna só as linhas dentro da janela, mais recentes primeiro
- [x] `contarErrosPeriodo` aceita `PeriodoRelatorio` (data pura) e conta certo considerando fuso (mesmo achado real documentado em `usoIa.ts`: não pode só concatenar "T00:00:00.000Z" na data local)

**Verification:**
- [x] `npm test -- tests/db/errosExecucao.test.ts`
- [x] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/db/migrations/0008_erros_execucao.sql`
- `src/db/repositories/errosExecucao.ts`
- `tests/db/errosExecucao.test.ts`

**Estimated scope:** Small (2 arquivos de código + teste, sem dependência)

---

### Tarefa 42: helper `tratarErroCriticoJob` + integração nos 4 scripts de job

**Description:** Novo `src/scripts/tratarErroCriticoJob.ts` — função `tratarErroCriticoJob(db, logger, contexto, erro, botToken, chatIds)`: grava a falha via `registrarErro` (mensagem = `erro.message` se `Error`, senão `String(erro)`; `detalhes` = `erro.stack` quando disponível), loga via `logger.error`, e envia um alerta (`⚠️ Erro crítico no job "..."`) pra cada `chatId` da allowlist via `new Bot(botToken).api.sendMessage` (com `.catch` por chat, uma falha de envio não deve impedir o registro nem os outros envios). Integrar nos 4 scripts existentes (`backup.ts`, `monitorarPrecos.ts`, `relatorioSemanal.ts`, `relatorioMensal.ts`): mover o corpo de `main()` (depois de `loadEnv`/`getDb`/`createLogger`/`Bot` já resolvidos) pra dentro de um `try`, chamando `tratarErroCriticoJob` no `catch` e relançando o erro (mantém o `.catch(...)` externo existente com `console.error`/`process.exitCode = 1` funcionando igual a hoje).

**Acceptance criteria:**
- [ ] Erro lançado dentro do corpo de qualquer um dos 4 scripts grava uma linha em `erros_execucao` com o `contexto` certo (nome do job) antes de propagar
- [ ] Alerta é enviado pra cada `chatId` da allowlist quando o job falha
- [ ] Falha ao enviar alerta pra um chat não impede o registro em `erros_execucao` nem o envio pros outros chats
- [ ] Comportamento de sucesso (sem erro) dos 4 scripts não muda

**Verification:**
- [ ] `npm test -- tests/scripts/tratarErroCriticoJob.test.ts`
- [ ] `npm test -- tests/scripts/monitorarPrecos.test.ts tests/scripts/backup.test.ts tests/scripts/relatorioSemanal.test.ts tests/scripts/relatorioMensal.test.ts` (os que já existirem)
- [ ] `npm run build`

**Dependencies:** Tarefa 41

**Files likely touched:**
- `src/scripts/tratarErroCriticoJob.ts`
- `src/scripts/backup.ts`
- `src/scripts/monitorarPrecos.ts`
- `src/scripts/relatorioSemanal.ts`
- `src/scripts/relatorioMensal.ts`
- `tests/scripts/tratarErroCriticoJob.test.ts`

**Estimated scope:** Medium (5 arquivos de código + teste novo, toca 4 scripts existentes)

---

### Tarefa 43: tool de chat `listar_erros(periodo)`

**Description:** Nova tool `listar_erros` (schema `{ periodo: 'dia' | 'semana' | 'mes' }`, mesmo enum de `relatorio`) em `src/ai/tools/errosExecucao.ts` — resolve a janela via `calcularJanelaPeriodo`, chama `listarErros(db, janela)`, formata cada linha (`contexto`, `mensagem`, `data_hora`) numa lista de texto; sem erro no período, devolve uma frase dizendo que não houve erro. Registrada em `montarToolsConversa` (`conversaTools.ts`).

**Acceptance criteria:**
- [ ] Período com erros registrados lista cada um (contexto + mensagem + data/hora)
- [ ] Período sem erro nenhum devolve mensagem clara de "nenhum erro", nunca lista vazia sem explicação

**Verification:**
- [ ] `npm test -- tests/ai/tools/errosExecucao.test.ts`
- [ ] `npm run build`

**Dependencies:** Tarefa 41

**Files likely touched:**
- `src/ai/tools/errosExecucao.ts`
- `src/ai/tools/conversaTools.ts`
- `tests/ai/tools/errosExecucao.test.ts`
- `tests/ai/tools/conversaTools.test.ts`

**Estimated scope:** Small (1 tool nova + registro)

---

### Tarefa 44: relatórios mostram contagem de erros técnicos do período

**Description:** `DadosRelatorio` (`src/relatorios/formatar.ts`) ganha o campo `errosTecnicos: number`. `formatarRelatorio` inclui uma linha extra (fora da seção "Uso de IA", só quando `errosTecnicos > 0`) — ex: `Erros técnicos no período: 2 (ver listar_erros).` Os 3 chamadores de `formatarRelatorio` passam a calcular e passar esse valor: tool `relatorio` (`src/ai/tools/relatorios.ts`), `montarRelatorioSemanal` e `montarRelatorioMensal` (via `contarErrosPeriodo` da Tarefa 41).

**Acceptance criteria:**
- [ ] `errosTecnicos > 0` mostra a linha extra no relatório, com o número certo
- [ ] `errosTecnicos === 0` não mostra a linha (sem texto vazio nem "0 erros")
- [ ] A linha aparece independente de `usoIa.porFluxoModelo` estar vazio ou não (não fica escondida pelo "Nenhum uso de IA registrado no período")

**Verification:**
- [ ] `npm test -- tests/relatorios/formatar.test.ts tests/relatorios/usoIa.test.ts`
- [ ] `npm run build`

**Dependencies:** Tarefa 41

**Files likely touched:**
- `src/relatorios/formatar.ts`
- `src/ai/tools/relatorios.ts`
- `src/scripts/relatorioSemanal.ts`
- `src/scripts/relatorioMensal.ts`
- `tests/relatorios/formatar.test.ts`

**Estimated scope:** Small (1 arquivo de composição + 3 chamadores pequenos)

## Checkpoint: `erros_execucao` funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: forçar um erro num job, confirmar linha em `erros_execucao` via consulta direta ao banco e alerta recebido no Telegram; pedir `relatorio` real e confirmar a contagem de erros aparecendo; testar `listar_erros(periodo)` via Telegram
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)
