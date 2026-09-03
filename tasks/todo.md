# Tarefas: Fase 5 — Roteamento de IA por fluxo + monitoramento de preços

> Ver `tasks/plan.md` para o grafo de dependência completo e as decisões de arquitetura. Fluxo de trabalho (branch/PR/merge) conforme `CLAUDE.md`.

## Fase H: Roteamento por fluxo

### Tarefa 22: Repositório `roteamento_tarefas` + aplicar nos fluxos existentes ✅

**Implementado:** conforme descrito abaixo, sem desvios do planejado. `modeloAtivo.ts` (Fase 4) ganhou `resolverModeloConversa(db, chatId)` (override do chat > `roteamento_tarefas` > `MODELO_PADRAO`), substituindo o antigo `obterModeloAtivo` (que já embutia só o fallback pra `MODELO_PADRAO`) — `obterOverrideModelo` isola só a leitura do override, usado internamente e pelo `handlerModelo` (que passou a receber `db` pra exibir o modelo resolvido, não só o override cru). `resumirContexto.ts` resolve o modelo do fluxo `resumir_contexto` do mesmo jeito (`obterModeloRoteamento(db, 'resumir_contexto') ?? MODELO_RESUMO`), sem override de chat (esse fluxo não tem comando pra trocar por chat).

**Descrição:** `src/db/repositories/roteamentoTarefas.ts` (novo): `obterModeloRoteamento(db, fluxo)` (retorna `modelo_preferido` da linha, ou `undefined` se não existir — sem lançar erro) e `definirRoteamento(db, fluxo, modeloPreferido, requisitos?)` (`INSERT ... ON CONFLICT(fluxo) DO UPDATE`, já que `fluxo` é `UNIQUE`). `texto.ts` passa a resolver o modelo de `conversa_texto` como `obterModeloAtivo(chatId) ?? obterModeloRoteamento(db, 'conversa_texto') ?? MODELO_PADRAO` (override do chat sempre vence, `roteamento_tarefas` é o padrão de fábrica); `resumirContexto.ts` resolve `MODELO_RESUMO` do mesmo jeito pro fluxo `resumir_contexto`, sem override de chat (esse fluxo não tem comando pra trocar por chat).

**Acceptance criteria:**
- [x] Existe uma linha em `roteamento_tarefas` pra um fluxo e o modelo dela é de fato usado na próxima chamada daquele fluxo
- [x] Fluxo sem linha em `roteamento_tarefas` continua usando a constante padrão atual, sem quebrar nem exigir seed
- [x] `/modelo` (override por chat, Fase 4) continua tendo precedência sobre `roteamento_tarefas` em `conversa_texto`

**Verification:**
- [x] `npm test` cobre: leitura com/sem linha existente, definição/atualização (`ON CONFLICT`), precedência de `/modelo` sobre `roteamento_tarefas`, `resumir_contexto` usando `roteamento_tarefas` quando definido — 367/367 em `development`
- [x] `npm run build`/`lint` sem erro
- [x] Manual em Homologação: inserir uma linha em `roteamento_tarefas` pro fluxo `conversa_texto` com um modelo diferente do padrão (sem usar `/modelo`), confirmar em `interacoes_ia.modelo` que a próxima conversa usou esse modelo — confirmado (`modelo = 'openai/gpt-5-nano'` depois de inserir a linha direto no banco, sem `/modelo`)

**Dependencies:** None (tabela já existe desde a Fase 1)

**Files likely touched:**
- `src/db/repositories/roteamentoTarefas.ts` (novo)
- `src/bot/handlers/texto.ts`
- `src/ai/resumirContexto.ts`
- `tests/db/roteamentoTarefas.test.ts` (novo)

**Estimated scope:** Medium (4 arquivos)

---

## Checkpoint: Roteamento aplicado
- [x] `npm run build`/`lint`/`test` sem erro (367/367 em `development`, checado nesta revisão)
- [x] Testar manualmente em Homologação: inserir uma linha em `roteamento_tarefas` pro fluxo `conversa_texto` com um modelo diferente do padrão, confirmar que a próxima conversa usa esse modelo (sem `/modelo` sobrescrever) — confirmado
- [ ] Revisão com o usuário antes de prosseguir

---

## Fase I: Monitoramento de preço e alerta

### Tarefa 23: Repositório `modelos_openrouter_historico` + script de snapshot semanal

**Descrição:** `src/db/repositories/modelosOpenrouterHistorico.ts` (novo): `registrarSnapshotModelo(db, { modelo, precoPrompt, precoCompletion, capacidades, dataSnapshot })` (insert) e `obterUltimosSnapshots(db, modelo, limite)` (últimos N snapshots de um modelo, mais recente primeiro — base pra comparação de preço da Tarefa 24). `scripts/monitorarPrecos.ts` (novo, mesmo padrão de `scripts/backup.ts`): busca `GET https://openrouter.ai/api/v1/models` (endpoint público, sem autenticação), grava um snapshot por modelo do catálogo (`capacidades` como JSON — inclui pelo menos `supported_parameters`, usado na Tarefa 24 pra checar `requisitos`).

**Acceptance criteria:**
- [ ] Rodar o script grava um snapshot por modelo do catálogo em `modelos_openrouter_historico`
- [ ] Falha de rede/API não derruba o processo com stack trace cru — erro logado, `process.exitCode = 1` (mesmo padrão de `backup.ts`)

**Verification:**
- [ ] `npm test` cobre o repositório (registrar, consultar últimos N) com fetch mockado no teste do script (sem chamada de rede real em teste automatizado)
- [ ] `npm run build`/`lint` sem erro
- [ ] Manual em Homologação: rodar `node dist/scripts/monitorarPrecos.js` manualmente (`docker compose exec`), conferir `modelos_openrouter_historico` populado no banco

**Dependencies:** None (tabela já existe desde a Fase 1)

**Files likely touched:**
- `src/db/repositories/modelosOpenrouterHistorico.ts` (novo)
- `src/scripts/monitorarPrecos.ts` (novo)
- `tests/db/modelosOpenrouterHistorico.test.ts` (novo)
- `tests/scripts/monitorarPrecos.test.ts` (novo)

**Estimated scope:** Medium (4 arquivos)

---

### Tarefa 24: Alerta de preço via Telegram + job semanal

**Descrição:** Estende `scripts/monitorarPrecos.ts` (roda na sequência, mesma execução semanal): depois de gravar o snapshot novo, pra cada linha de `roteamento_tarefas` (fluxo com modelo preferido definido), compara (a) o preço do modelo ativo no snapshot novo vs. o snapshot anterior do mesmo modelo — mudou, alerta; (b) varre os demais modelos do snapshot novo cujo `supported_parameters` cobre a lista de `requisitos` daquela linha (comparação simples, string contém) e é mais barato que o modelo ativo — achou, alerta. Mensagem enviada via `new Bot(token).api.sendMessage(chatId, texto)` (sem long polling, só a chamada pontual da API) pra cada `chatId` em `env.telegramAllowedChatIds`. `docker-compose.yml` ganha `monitor-precos-producao`/`monitor-precos-homologacao` (mesmo padrão do `backup-*`: `while true; do node dist/scripts/monitorarPrecos.js; sleep 604800; done`).

**Acceptance criteria:**
- [ ] Preço do modelo ativo de um fluxo mudando entre dois snapshots dispara uma mensagem no Telegram
- [ ] Surgimento de um modelo mais barato que atende `requisitos` de um fluxo dispara uma mensagem no Telegram
- [ ] Nenhuma mudança de preço/candidato não dispara mensagem nenhuma (sem ruído)
- [ ] O alerta nunca altera `roteamento_tarefas` sozinho — só avisa

**Verification:**
- [ ] `npm test` cobre: disparo por mudança de preço, disparo por candidato mais barato, não-disparo quando nada mudou, filtro por `requisitos`
- [ ] `npm run build`/`lint` sem erro
- [ ] Manual em Homologação: forçar uma mudança de preço nos dados de teste (snapshot manual com preço diferente do anterior) e confirmar que a mensagem chega no Telegram

**Dependencies:** Tarefa 22 (`roteamento_tarefas`), Tarefa 23 (snapshot)

**Files likely touched:**
- `src/scripts/monitorarPrecos.ts`
- `docker-compose.yml`
- `tests/scripts/monitorarPrecos.test.ts`

**Estimated scope:** Medium (3 arquivos)

---

## Checkpoint: Monitoramento de preço funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Rodar `scripts/monitorarPrecos.ts` manualmente em Homologação, confirmar snapshot gravado em `modelos_openrouter_historico`
- [ ] Testar o alerta manualmente (forçar uma mudança de preço/candidato mais barato nos dados de teste), confirmar mensagem recebida no Telegram
- [ ] Revisão com o usuário antes de prosseguir

---

## Fase J: Prompt caching

### Tarefa 25: Prompt caching nativo (Anthropic `cache_control`)

**Descrição:** `gerarResposta` (`src/ai/openrouter.ts`): quando `modelo` começa com `anthropic/`, a mensagem de `system` (system prompt) passa a incluir `cache_control: { type: 'ephemeral', ttl: '1h' }` (campo de extensão do OpenRouter, fora do tipo padrão do SDK `openai` — via cast pontual, mesmo padrão já usado no projeto quando a lib não cobre um campo específico do provedor). Depois da chamada, se `completion.usage` trouxer `cached_tokens`/`cache_write_tokens` (ou os nomes equivalentes que o OpenRouter expõe), loga em `info` pra permitir verificação manual de que o cache está de fato ativo — sem gravar coluna nova no banco (só observabilidade via log, decisão de escopo mínimo).

**Acceptance criteria:**
- [ ] Modelo Anthropic ativo (roteado ou via `/modelo`) envia `cache_control` no system prompt
- [ ] Modelo não-Anthropic não sofre nenhuma mudança de payload
- [ ] `cached_tokens`/`cache_write_tokens` da resposta (quando presentes) aparecem no log da interação

**Verification:**
- [ ] `npm test` cobre: `cache_control` presente só quando `modelo` é `anthropic/*`, ausente pra outros provedores, log de cache tokens quando presentes na resposta mockada
- [ ] `npm run build`/`lint` sem erro
- [ ] Manual em Homologação: `/modelo anthropic/claude-<algum modelo válido>`, conversa de dois turnos, conferir no log que `cached_tokens` aparece maior que 0 no segundo turno

**Dependencies:** None (funciona independente do roteamento estar completo)

**Files likely touched:**
- `src/ai/openrouter.ts`
- `tests/ai/openrouter.test.ts`

**Estimated scope:** Small (2 arquivos)

---

## Checkpoint: Fase 5 completa
- [ ] Todos os critérios de aceite das Tarefas 22-25 atendidos
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação confirmando cache ativo (`cached_tokens` > 0) numa conversa com modelo Anthropic roteado via `/modelo`
- [ ] PROGRESSO.md atualizado com o marco "Fase 5 concluída"
- [ ] Revisão com o usuário antes de prosseguir para a Fase 6
