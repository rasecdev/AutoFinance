# Todo: Lembrete automático de reautorização do Google

Ver `tasks/plan.md` pro racional completo. Fecha o último atrito da rodada
"Persistência do refresh_token Google" (2026-10-03): o usuário não precisa mais lembrar de
rodar `/registrar_email confirmar` sozinho — o bot manda o lembrete + link a cada 5 dias.

---

### Tarefa 134: migration `lembrete_reautorizacao_google` + repositório

**Description:** Tabela singleton nova (mesmo padrão de `credenciais_google`/`bot_pausado`)
guardando só `enviado_em` (quando foi o último lembrete automático enviado). Repositório
`src/db/repositories/lembreteReautorizacaoGoogle.ts`: `obterUltimoEnvio(db): Date | null` e
`registrarEnvio(db): void` (upsert por `id=1`).

**Acceptance criteria:**
- [ ] `obterUltimoEnvio` devolve `null` com a tabela vazia
- [ ] `registrarEnvio` seguido de `obterUltimoEnvio` devolve uma `Date` próxima de "agora"
- [ ] `registrarEnvio` chamado duas vezes não duplica linha (upsert)

**Verification:**
- [ ] Tests pass: `npx vitest run tests/db/lembreteReautorizacaoGoogle.test.ts`
- [ ] Build succeeds: `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/db/migrations/0020_lembrete_reautorizacao_google.sql`
- `src/db/repositories/lembreteReautorizacaoGoogle.ts`
- `tests/db/lembreteReautorizacaoGoogle.test.ts`

**Estimated scope:** Small

---

### Tarefa 135: agendador do lembrete + wiring em `index.ts`

**Description:** Extrai de `bot/handlers/registrarEmail.ts` a função `montarLinkVinculoGoogle`
(monta `OAuth2Client`, gera a URL de autorização, marca a pendência via
`definirPendenciaOAuthGoogle`) e `montarMensagemVinculoGoogle` (texto reaproveitável do
passo a passo 1-4), ambas exportadas. `handlerRegistrarEmail` passa a chamar essas funções em
vez de duplicar a lógica. Novo `src/bot/lembreteReautorizacaoGoogle.ts`:
`iniciarLembreteReautorizacaoGoogle(bot, env, db, logger)` — agenda via `setTimeout`
encadeado (base de cálculo em `obterUltimoEnvio(db)` + `INTERVALO_MS` de 5 dias, delay 0 se
já venceu), manda mensagem própria (deixa claro que é automático) + link pra cada
`env.telegramAllowedChatIds`, chama `registrarEnvio(db)` depois de mandar, reagenda o próximo
ciclo. `index.ts` chama essa função uma vez na subida, só se `env.googleOAuthClient` existir.

**Acceptance criteria:**
- [ ] Sem `env.googleOAuthClient`, nada é agendado (sem erro, sem timer criado)
- [ ] Com `env.googleOAuthClient` e nenhum envio registrado ainda, o primeiro lembrete é
      agendado pra 5 dias a partir de agora (não imediatamente)
- [ ] Com um `enviado_em` já no passado (> 5 dias), o lembrete dispara assim que o processo
      sobe (delay 0), não espera mais 5 dias
- [ ] Lembrete enviado marca `registrarEnvio` e reagenda o próximo ciclo pra +5 dias a partir
      do novo envio
- [ ] Falha ao enviar pra um `chatId` não impede o envio pros outros (mesmo padrão de
      `tratarErroCriticoJob`)
- [ ] Colar o código recebido via lembrete funciona exatamente igual ao `/registrar_email`
      manual (mesma pendência, mesmo `handlerCodigoOAuthGoogle`)

**Verification:**
- [ ] Tests pass: `npx vitest run tests/bot/handlers/registrarEmail.test.ts tests/bot/lembreteReautorizacaoGoogle.test.ts` (fake timers pro agendamento)
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: cobre no checkpoint final (teste manual real em Homologação, com
      `INTERVALO_MS` reduzido temporariamente pra não esperar 5 dias de verdade)

**Dependencies:** Tarefa 134

**Files likely touched:**
- `src/bot/handlers/registrarEmail.ts`
- `src/bot/lembreteReautorizacaoGoogle.ts`
- `src/index.ts`
- `tests/bot/handlers/registrarEmail.test.ts`
- `tests/bot/lembreteReautorizacaoGoogle.test.ts`

**Estimated scope:** Small

---

### Checkpoint: Rodada fechada (lembrete automático de reautorização)
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: confirmar que o lembrete chega no Telegram (com
      `INTERVALO_MS` reduzido só pro teste, revertido antes do merge final) e que colar o
      código vincula normalmente
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Milestone "Lembrete automático de reautorização do Google" fechado no GitHub (2/2 issues)
