# Todo: Persistência do refresh_token do Google no banco

Ver `tasks/plan.md` pro racional completo das decisões de arquitetura. Rodada motivada pelo
achado `invalid_grant` de 2026-10-01/02 (PROGRESSO.md) — não resolve a expiração do token em
si (decisão já tomada de não publicar o app pra Production), só remove o atrito manual
(SSH + editar `.env` + restart) de cada reautorização.

---

### Tarefa 128: migration `credenciais_google` + repositório

**Description:** Tabela singleton nova (`id INTEGER PRIMARY KEY CHECK(id=1)`, mesmo padrão
de `bot_pausado`) pra guardar o `refresh_token` atual do Google. Repositório
`src/db/repositories/credenciaisGoogle.ts`: `salvarRefreshToken(db, token)` (upsert por
`id=1`, nunca duplica linha nem acumula histórico) e `obterRefreshToken(db): string | null`.
Comentário na migration alertando que esta tabela nunca entra em nenhuma tool de consulta
dinâmica (ver Architecture Decisions do plan).

**Acceptance criteria:**
- [x] `obterRefreshToken` devolve `null` com a tabela vazia
- [x] `salvarRefreshToken` seguido de `obterRefreshToken` devolve o valor salvo
- [x] `salvarRefreshToken` chamado duas vezes com valores diferentes deixa só uma linha na
      tabela (upsert, não insert duplicado) e `obterRefreshToken` devolve o valor mais
      recente

**Verification:**
- [x] Tests pass: `npx vitest run tests/db/credenciaisGoogle.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/db/migrations/0018_credenciais_google.sql`
- `src/db/repositories/credenciaisGoogle.ts`
- `tests/db/repositories/credenciaisGoogle.test.ts`

**Estimated scope:** Small

---

### Tarefa 129: `env.ts` — remove `GOOGLE_REFRESH_TOKEN`, `googleOAuthClient` ganha `calendarId`

**Description:** Remove `GOOGLE_REFRESH_TOKEN` do schema Zod e o campo composto `google` do
tipo `Env` (deixa de existir — token não mora mais em env). `googleOAuthClient` passa a
incluir `calendarId` (lido de `GOOGLE_CALENDAR_ID`, default `'primary'`) e fica disponível
sempre que `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` estiverem presentes, sem depender de
token nenhum.

**Acceptance criteria:**
- [x] `env.google` não existe mais (erro de compilação em qualquer lugar que ainda referencie)
- [x] `googleOAuthClient` presente (com `calendarId`) só com `CLIENT_ID`/`CLIENT_SECRET`
      configurados, independente de `GOOGLE_REFRESH_TOKEN` (que nem existe mais no schema)
- [x] `GOOGLE_CALENDAR_ID` ausente → `calendarId` default `'primary'`

**Verification:**
- [x] Tests pass: `npx vitest run tests/config/env.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/config/env.ts`
- `tests/config/env.test.ts`

**Estimated scope:** Small

---

### Checkpoint: Armazenamento pronto
- [x] `npm run build`/`lint`/`test` sem erro
- [x] Revisão rápida: `credenciais_google` não aparece em `DominioConsulta`, `TODAS_DIMENSOES`
      nem em nenhum mapa de coluna de `src/ai/tools/consultaDinamica.ts` ou
      `src/relatorios/consultaDinamica.ts`

---

### Tarefa 130: jobs (`lerEmailFaturas.ts`/`sincronizarCalendario.ts`) leem token do banco

**Description:** Troca a checagem `env.google === null` por `env.googleOAuthClient === null`
(app não configurado — mesmo comportamento de "integração desligada" de hoje). Com o app
configurado, lê `obterRefreshToken(db)`; se vier `null` (configurado mas nunca vinculado),
mesmo caminho de "integração desligada" (dorme o intervalo normal e sai, sem busy-loop).
Com token presente, monta `{...env.googleOAuthClient, refreshToken}` pra
`criarClientesGoogle` (assinatura da função não muda).

**Acceptance criteria:**
- [x] `googleOAuthClient === null` → comportamento idêntico ao `env.google === null` de hoje
      (loga, dorme o intervalo, sai sem rodar nada)
- [x] `googleOAuthClient` presente mas `obterRefreshToken(db) === null` → mesmo caminho de
      "desligada" (nunca tenta montar client sem token)
- [x] Token presente → `criarClientesGoogle` recebe `calendarId` de `env.googleOAuthClient`
      e `refreshToken` do banco, comportamento de leitura/sincronização inalterado

**Verification:**
- [x] Tests pass: `npx vitest run tests/scripts/lerEmailFaturas.test.ts tests/scripts/sincronizarCalendario.test.ts`
- [x] Build succeeds: `npm run build`
- [x] Manual check: nenhum (cobre na Tarefa de checkpoint final, teste manual real em Homologação)

**Dependencies:** Tarefas 128, 129

**Files likely touched:**
- `src/scripts/lerEmailFaturas.ts`
- `src/scripts/sincronizarCalendario.ts`
- `tests/scripts/lerEmailFaturas.test.ts`
- `tests/scripts/sincronizarCalendario.test.ts`

**Estimated scope:** Small

---

### Tarefa 131: `scripts/configurarGoogleOAuth.ts` persiste no banco

**Description:** CLI manual (caminho alternativo ao `/registrar_email` desde a Fase 7) passa
a chamar `salvarRefreshToken(db, token)` depois de obter o token, em vez de só imprimir
instrução pra colar no `.env` — evita deixar um segundo caminho desatualizado em relação ao
novo fluxo.

**Acceptance criteria:**
- [x] Script abre o banco (mesmo padrão de outros scripts, `getDb(env)`) e persiste o token
      obtido via `salvarRefreshToken`
- [x] Mensagem de console final confirma persistência no banco, sem mencionar `.env`/restart

**Verification:**
- [x] Build succeeds: `npm run build`
- [x] Manual check: leitura do código confirma a chamada a `salvarRefreshToken` antes do
      `console.log` final (script é interativo via stdin, sem teste automatizado de ponta a
      ponta já existente)

**Dependencies:** Tarefa 128

**Files likely touched:**
- `src/scripts/configurarGoogleOAuth.ts`

**Estimated scope:** Small

---

### Tarefa 132: `/registrar_email` persiste direto, token nunca mais aparece em texto

**Description:** `createHandlerRegistrarEmail` passa a receber `db` (além de `env`). A
checagem "este ambiente já tem vínculo" usa `obterRefreshToken(db) !== null` em vez de
`env.google`; a mensagem correspondente usa `env.googleOAuthClient.calendarId`.
`createHandlerCodigoOAuthGoogle` chama `salvarRefreshToken(db, tokens.refresh_token)` e
responde confirmando o vínculo — sem exibir o token em texto, então remove a chamada a
`agendarAutoApagar` (e o import de `agendarApagarPersistido`/`removerAgendamento`) deste
handler. `src/index.ts` passa `db` na construção do handler.

**Acceptance criteria:**
- [x] Colar o código de autorização salva o token no banco (via `salvarRefreshToken`) e a
      resposta do bot não contém o valor do `refresh_token` em texto
- [x] "Este ambiente já tem vínculo" passa a ser decidido por `obterRefreshToken(db)`, não por
      `env.google`
- [x] Mensagem de vínculo existente mostra a agenda via `env.googleOAuthClient.calendarId`

**Verification:**
- [x] Tests pass: `npx vitest run tests/bot/handlers/registrarEmail.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Tarefas 128, 129

**Files likely touched:**
- `src/bot/handlers/registrarEmail.ts`
- `src/index.ts`
- `tests/bot/handlers/registrarEmail.test.ts`

**Estimated scope:** Small

---

### Tarefa 133: remove o mecanismo `mensagens_pendentes_apagar` (código morto)

**Description:** Depois da Tarefa 132, nada mais chama `agendarApagarPersistido`/
`listarVencidas`/`removerAgendamento` em lugar nenhum do projeto (confirmado por grep antes
de planejar) — remove em vez de deixar código sem uso. Migration nova
`0019_remove_mensagens_pendentes_apagar.sql` (`DROP TABLE mensagens_pendentes_apagar`) —
migration antiga 0013 nunca é editada/apagada, só superada. Remove
`src/db/repositories/mensagensPendentesApagar.ts` e, em `src/index.ts`, a função
`apagarMensagensPendentesAtrasadas` e o import de `listarVencidas`/`removerAgendamento`.

**Acceptance criteria:**
- [x] `grep -r "mensagensPendentesApagar\|listarVencidas\|removerAgendamento\|agendarApagarPersistido" src/`
      não retorna nada
- [x] Migration `0019` dropa a tabela sem erro rodando sobre um banco já migrado até 0018
- [x] `index.ts` sobe sem o sweep de boot removido, sem erro

**Verification:**
- [x] Tests pass: `npm test` (suite completa, 962 testes — 6 falhas de timeout isoladas por
      carga da máquina, não relacionadas; confirmado passando ao rodar os 5 arquivos
      isoladamente, 102/102)
- [x] Build succeeds: `npm run build`

**Dependencies:** Tarefa 132

**Files likely touched:**
- `src/db/migrations/0019_remove_mensagens_pendentes_apagar.sql`
- `src/db/repositories/mensagensPendentesApagar.ts` (removido)
- `tests/db/repositories/mensagensPendentesApagar.test.ts` (removido, se existir)
- `src/index.ts`

**Estimated scope:** Small

---

### Checkpoint: Rodada fechada (persistência do refresh_token no banco)
- [ ] `npm run build`/`lint`/`test` sem erro, suite completa
- [ ] Teste manual em Homologação: `/registrar_email confirmar` → autorizar → colar código →
      bot confirma vínculo sem pedir nada manual na VM (sem exibir token, sem instrução de
      `.env`/restart)
- [ ] Teste manual: `docker compose restart ler-email-faturas-homologacao
      sincronizar-calendario-homologacao` (ou esperar o próximo ciclo natural) e confirmar que
      os dois jobs funcionam lendo o token do banco
- [ ] PROGRESSO.md atualizado com o marco — e nota de que o achado de 2026-10-01/02 teve o
      atrito manual resolvido, mas a expiração a cada ~7 dias continua existindo (sem mudança
      de decisão sobre publicar o app)
- [ ] Milestone "Persistência do refresh_token Google" fechado no GitHub (6/6 issues)
- [ ] Revisão com o usuário antes de retomar a rodada WhatsApp pausada
      (`tasks/plan-multicanal-whatsapp.md`/`tasks/todo-multicanal-whatsapp.md`)
