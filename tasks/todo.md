# Tasks: Multi-canal — WhatsApp via WAHA (Rodada 3: comandos restantes + substituto de autocomplete)

Spec completa em `PLANO.md` ("Fase 9 — Rodada 3"). Plano/riscos em `tasks/plan.md`.

---

## Tarefa 139: migration `bot_pausado.chat_id` pra `TEXT PRIMARY KEY`

**Description:** `bot_pausado.chat_id` hoje é `INTEGER PRIMARY KEY` (migration `0017`) — alias de rowid no SQLite, que exige um inteiro de verdade e ignora a conversão de afinidade normal (mesmo bug já corrigido em `confirmacoes_pendentes` na Tarefa 135 da Rodada 2, migration `0023`). Corrigir o schema ANTES de `/pausar`/`/retomar` ficarem acessíveis via WhatsApp (Tarefa 144), senão o bug (`SqliteError: datatype mismatch` ao gravar um `chatId` string) seria conhecido e evitável sendo lançado de propósito.

**Acceptance criteria:**
- [x] Nova migration recria `bot_pausado` com `chat_id TEXT PRIMARY KEY`, preservando dados existentes (mesmo padrão de `0023_confirmacoes_pendentes_chat_id_texto.sql`: tabela nova, copia, drop, rename)
- [x] Comentário em `src/db/repositories/botPausado.ts` que hoje afirma "a coluna chat_id não precisa de migration" é corrigido (afirmação estava errada por analogia, mesmo achado documentado em `confirmacoes_pendentes`)
- [x] `pausar`/`retomar`/`estaPausado` continuam funcionando sem mudança de assinatura (já aceitam `number | string`)

**Verification:**
- [x] Tests pass: `npx vitest run tests/db/botPausado.test.ts tests/db/migrate.test.ts` -- 15/15
- [x] Build succeeds: `npm run build`
- [x] Manual check: nenhum — comportamento observável do Telegram não muda; cobertura via teste automatizado (inserir um `chatId` string de teste e confirmar que não lança `datatype mismatch`) — teste novo em `tests/db/botPausado.test.ts`

**Dependencies:** None

**Files likely touched:**
- `src/db/migrations/0024_bot_pausado_chat_id_texto.sql`
- `src/db/repositories/botPausado.ts`
- `tests/db/botPausado.test.ts`
- `tests/db/migrate.test.ts` (contagem de migrations, se o teste checar isso)

**Estimated scope:** Small

---

## Tarefa 140: `ComandoBot` ganha campo `canais` (fonte única por canal)

**Description:** `src/bot/comandos.ts` (`COMANDOS_BOT`) ganha campo opcional `canais?: ('telegram' | 'whatsapp')[]` em `ComandoBot` — omitido = comando vale pros dois canais; `/errado` e `/certo` marcados explicitamente `['telegram']` (dependem de `message_id`, fora de escopo pro WhatsApp). Essa é a fonte única que o roteamento do webhook do WhatsApp (Tarefas 141-144) e `/ajuda` (Tarefa 143) vão consultar, pra nunca dessincronizar as duas listas — mesmo racional que já motivou `COMANDOS_BOT` existir como array único (comentário do próprio arquivo).

**Acceptance criteria:**
- [x] `ComandoBot.canais?: ('telegram' | 'whatsapp')[]` adicionado ao type
- [x] `errado` e `certo` em `COMANDOS_BOT` marcados `canais: ['telegram']`; os demais 8 comandos (incluindo `registrar_email`/`registrar_open_finance`, já ativos no WhatsApp desde a Rodada 2) ficam sem o campo (omitido = ambos)
- [x] Função helper nova (`comandoValidoNoCanal(comando, canal)`) pra checar se um `ComandoBot` vale num canal — evita repetir a lógica de "omitido = ambos" em cada chamador
- [x] `index.ts`/`idioma.ts` (`setMyCommands`, só Telegram) continuam listando TODOS os comandos — `setMyCommands` é só do menu do Telegram, não filtra por canal (o campo novo não muda esse comportamento)

**Verification:**
- [x] Tests pass: `npx vitest run tests/bot/comandos.test.ts` — 5/5
- [x] Build succeeds: `npm run build`
- [x] Manual check: nenhum — campo novo não é consumido por nenhum roteamento real ainda nesta tarefa

**Dependencies:** None

**Files likely touched:**
- `src/bot/comandos.ts`
- `tests/bot/comandos.test.ts`

**Estimated scope:** Small

---

## Checkpoint: Fundação (depois das Tarefas 139-140)
- [x] `npm run build`/`lint`/`test` sem erro
- [x] Nenhuma regressão no Telegram nem no WhatsApp já existente (Rodada 2) — suíte completa passa igual antes — 1092/1092 testes

---

## Tarefa 141: `/modelo` e `/modelos` via WhatsApp

**Description:** Extrai o núcleo de `handlerModelo`/`handlerModelos` (`src/bot/handlers/modelo.ts`/`modelos.ts`) pra funções que recebem `CanalContext` + `chatId: number | string` + texto, com os `createHandler*` do Telegram virando wrappers finos (mesmo padrão de `processarRegistrarEmail`). Roteia os dois comandos em `webhookWhatsapp.ts` via `regexComando`, reaproveitando a ordem de prioridade já usada (comando de barra antes de pendência/conversa livre). Nenhuma mudança de lógica de negócio — `modeloAtivo.ts` já aceita `chatId: number | string` desde a Rodada 2.

**Acceptance criteria:**
- [x] `processarModelo(ctx: CanalContext, db, chatId, texto)` e `processarModelos(ctx: CanalContext, db, chatId)` extraídos, com `createHandlerModelo`/`createHandlerModelos` adaptando via `criarContextoTelegram`
- [x] `webhookWhatsapp.ts` roteia `/modelo` e `/modelos` pro núcleo compartilhado, usando o `chatId` do WhatsApp
- [x] Comportamento no Telegram idêntico ao atual (mensagens, troca de modelo, consulta sem argumento)
- [x] Mensagem de WhatsApp de número fora de `WHATSAPP_DESTINATARIOS` continua ignorada silenciosamente (allowlist checada antes do roteamento de comando, mesma ordem já usada pelos comandos da Rodada 2) — ordem inalterada, allowlist já roda antes de qualquer comando ser checado

**Verification:**
- [x] Tests pass: `npx vitest run tests/bot/handlers/modelo.test.ts tests/bot/handlers/modelos.test.ts tests/canais/webhookWhatsapp.test.ts` — 60/60
- [x] Build succeeds: `npm run build`
- [x] Manual check: nenhum ainda — fica pro checkpoint da Fase B (teste conjunto dos 3 comandos de leitura/config)

**Dependencies:** Tarefa 140

**Files likely touched:**
- `src/bot/handlers/modelo.ts`
- `src/bot/handlers/modelos.ts`
- `src/canais/webhookWhatsapp.ts`
- `tests/bot/handlers/modelo.test.ts`
- `tests/bot/handlers/modelos.test.ts`
- `tests/canais/webhookWhatsapp.test.ts`

**Estimated scope:** Medium

---

## Tarefa 142: `/idioma` via WhatsApp

**Description:** Extrai o núcleo de `handlerIdioma` (`src/bot/handlers/idioma.ts`) pra uma função que recebe `CanalContext` (idioma continua singleton/global, sem `chatId`), com `createHandlerIdioma` virando wrapper fino. A chamada `ctx.api.setMyCommands(...)` (atualiza o menu "/" do Telegram) **fica só no wrapper Telegram**, nunca no núcleo compartilhado — não existe equivalente no WhatsApp, e `CanalContext` não declara esse método (chamada indevida vira erro de compilação, não bug silencioso). Roteia `/idioma` em `webhookWhatsapp.ts`.

**Acceptance criteria:**
- [ ] `processarIdioma(ctx: CanalContext, db, texto)` extraído; `createHandlerIdioma` chama o núcleo e, só depois, `ctx.api.setMyCommands(...)` (fora do núcleo)
- [ ] `webhookWhatsapp.ts` roteia `/idioma` pro núcleo compartilhado
- [ ] Trocar o idioma via WhatsApp muda `idioma_bot` (afeta também as respostas do Telegram, comportamento já existente desde a Fase 10 — não é regressão, é consequência esperada do singleton)
- [ ] Trocar o idioma via WhatsApp não tenta chamar `setMyCommands` nem lança erro

**Verification:**
- [ ] Tests pass: `npx vitest run tests/bot/handlers/idioma.test.ts tests/canais/webhookWhatsapp.test.ts`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: nenhum ainda — fica pro checkpoint da Fase B

**Dependencies:** Tarefa 140

**Files likely touched:**
- `src/bot/handlers/idioma.ts`
- `src/canais/webhookWhatsapp.ts`
- `tests/bot/handlers/idioma.test.ts`
- `tests/canais/webhookWhatsapp.test.ts`

**Estimated scope:** Small

---

## Tarefa 143: `/ajuda` via WhatsApp (filtragem por canal + formatação dupla)

**Description:** Extrai o núcleo de `handlerAjuda` (`src/bot/handlers/ajuda.ts`) pra uma função que recebe `CanalContext`, filtra `COMANDOS_BOT` pelo canal atual (usando o helper da Tarefa 140) e monta o texto com formatação dupla — tags HTML (`<b>`/`<i>`) pro Telegram, marcação nativa do WhatsApp (`*negrito*`/`_itálico_`) pro WhatsApp — a partir do mesmo dado estruturado (`TEXTOS[idioma].categorias`). Roteia `/ajuda` em `webhookWhatsapp.ts`.

**Acceptance criteria:**
- [ ] `processarAjuda(ctx: CanalContext, db, canal: 'telegram' | 'whatsapp')` extraído (ou mecanismo equivalente pra decidir formatação — decisão de implementação)
- [ ] Lista de comandos de `/ajuda` no WhatsApp inclui só os comandos cujo `canais` (Tarefa 140) inclui `'whatsapp'` (nesta tarefa, isso ainda é só `/registrar_email`/`/registrar_open_finance` + os comandos das Tarefas 141-142 se já mergeadas antes — `/pausar`/`/retomar` só aparecem depois da Tarefa 144, ver risco registrado em `tasks/plan.md`)
- [ ] Texto de `/ajuda` no Telegram continua com as tags HTML de hoje (sem regressão visual)
- [ ] Texto de `/ajuda` no WhatsApp usa `*negrito*`/`_itálico_` em vez de `<b>`/`<i>` cru
- [ ] `webhookWhatsapp.ts` roteia `/ajuda` pro núcleo compartilhado

**Verification:**
- [ ] Tests pass: `npx vitest run tests/bot/handlers/ajuda.test.ts tests/canais/webhookWhatsapp.test.ts`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: nenhum ainda — fica pro checkpoint da Fase B

**Dependencies:** Tarefa 140

**Files likely touched:**
- `src/bot/handlers/ajuda.ts`
- `src/canais/webhookWhatsapp.ts`
- `tests/bot/handlers/ajuda.test.ts`
- `tests/canais/webhookWhatsapp.test.ts`

**Estimated scope:** Medium

---

## Checkpoint: Comandos de leitura/config funcionais (depois das Tarefas 141-143)
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: `/modelo`, `/modelos`, `/idioma` e `/ajuda` via WhatsApp — respostas corretas, `/ajuda` com marcação legível (sem tag HTML crua aparecendo)

---

## Tarefa 144: `/pausar` e `/retomar` via WhatsApp

**Description:** Extrai o núcleo de `handlerPausar`/`handlerRetomar` (`src/bot/handlers/pausar.ts`/`retomar.ts`) pra funções que recebem `CanalContext` + `chatId: number | string`, com os `createHandler*` do Telegram virando wrappers finos. Roteia os dois comandos em `webhookWhatsapp.ts`. Depende da Tarefa 139 (migration) já estar mergeada — gravar `chatId` string em `bot_pausado` sem ela reproduziria o `datatype mismatch` já conhecido.

**Acceptance criteria:**
- [ ] `processarPausar(ctx: CanalContext, db, chatId)` e `processarRetomar(ctx: CanalContext, db, chatId)` extraídos, com os wrappers Telegram adaptando via `criarContextoTelegram`
- [ ] `webhookWhatsapp.ts` roteia `/pausar` e `/retomar` pro núcleo compartilhado, usando o `chatId` do WhatsApp (string)
- [ ] `/pausar` via WhatsApp grava em `bot_pausado` sem lançar `SqliteError` (migration 0024 já aplicada)
- [ ] `/pausar` num chat (Telegram ou WhatsApp) não afeta o outro canal — kill switch é por `chat_id`, não global
- [ ] Nenhuma mudança na API de sessão da WAHA como kill switch de emergência — os dois mecanismos continuam independentes

**Verification:**
- [ ] Tests pass: `npx vitest run tests/bot/handlers/pausar.test.ts tests/bot/handlers/retomar.test.ts tests/canais/webhookWhatsapp.test.ts`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: nenhum ainda — fica pro checkpoint final (teste completo dos 6 comandos)

**Dependencies:** Tarefa 139, Tarefa 140

**Files likely touched:**
- `src/bot/handlers/pausar.ts`
- `src/bot/handlers/retomar.ts`
- `src/canais/webhookWhatsapp.ts`
- `tests/bot/handlers/pausar.test.ts`
- `tests/bot/handlers/retomar.test.ts`
- `tests/canais/webhookWhatsapp.test.ts`

**Estimated scope:** Medium

---

## Checkpoint: Rodada 3 fechada (depois da Tarefa 144)
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: os 6 comandos (`/modelo`, `/modelos`, `/ajuda`, `/idioma`, `/pausar`, `/retomar`) respondendo corretamente via WhatsApp
- [ ] `/ajuda` via WhatsApp lista exatamente os 8 comandos aplicáveis (os 6 novos + `/registrar_email`/`/registrar_open_finance`), nunca `/errado`/`/certo`
- [ ] `/pausar` via WhatsApp confirmado sem afetar o chat do Telegram (e vice-versa)
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Issues da rodada e milestone fechados no GitHub
