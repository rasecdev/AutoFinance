# Todo: Multi-canal — WhatsApp via WAHA (Rodada 1: mensagens proativas)

Ver `tasks/plan.md` pro racional completo das decisões de arquitetura. Rodada 1 cobre só envio proativo (relatório semanal/mensal, alertas) via WhatsApp, em paralelo ao Telegram — chat bidirecional fica pra uma Rodada 2 futura.

---

### Tarefa 122: `docker-compose.yml` (serviços WAHA) + `env.ts` (novas variáveis)

**Description:** Dois novos serviços no `docker-compose.yml`, mesmo padrão de todo par existente (imagem oficial `devlikeapro/waha`, sem `build:` próprio — é imagem publicada, diferente do resto do projeto que sempre builda a própria): `whatsapp-homologacao`/`whatsapp-producao`, motor `NOWEB` via env var (`WHATSAPP_DEFAULT_ENGINE=NOWEB`), volume próprio por ambiente pra persistir a sessão (evita reescanear QR a cada restart), variável de API key própria por ambiente. `env.ts` ganha `WHATSAPP_WAHA_URL`, `WHATSAPP_WAHA_API_KEY`, `WHATSAPP_WAHA_SESSION`, `WHATSAPP_DESTINATARIOS` (lista de números, mesmo formato de `TELEGRAM_ALLOWED_CHAT_IDS`) — todas opcionais mas exigidas juntas (`superRefine`, mesma regra do par Google/Pluggy). Ausentes por completo é estado válido.

**Acceptance criteria:**
- [ ] `docker compose config` valida sem erro com os dois serviços novos
- [ ] `env.ts`: as 4 variáveis ausentes juntas não geram erro de validação (integração desligada)
- [ ] `env.ts`: só parte das 4 variáveis presentes gera erro de validação claro (mesmo padrão do par Google)
- [ ] Serviço `whatsapp-homologacao` sobe localmente (`docker compose up whatsapp-homologacao`) e responde no endpoint de health/QR da WAHA

**Verification:**
- [ ] Tests pass: `npx vitest run tests/config/env.test.ts`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: `docker compose up whatsapp-homologacao` sobe sem erro, `curl` no endpoint da API confirma resposta

**Dependencies:** None

**Files likely touched:**
- `docker-compose.yml`
- `src/config/env.ts`
- `tests/config/env.test.ts`

**Estimated scope:** Small

---

### Tarefa 123: `scripts/parearWhatsapp.ts` (pareamento inicial via QR code)

**Description:** Script de linha de comando, rodado uma vez (mesmo padrão de `configurarGoogleOAuth.ts`/`gerarConnectTokenPluggy.ts`): cria a sessão via `POST {WAHA_URL}/api/sessions` (nome da sessão de `WHATSAPP_WAHA_SESSION`), busca o QR code via `GET {WAHA_URL}/api/{session}/auth/qr` e salva como arquivo `.png` local (`qr-whatsapp.png` ou similar) — usuário abre o arquivo e escaneia com o WhatsApp do número dedicado. Roda dentro do container (`docker compose run --rm --no-deps whatsapp-homologacao ...` não se aplica — é o *bot* que chama a API da WAHA, não a WAHA em si; rodar como `docker compose run --rm --no-deps homologacao node dist/scripts/parearWhatsapp.js`, mesmo padrão dos outros scripts avulsos).

**Acceptance criteria:**
- [ ] Cria a sessão se ainda não existir (idempotente — sessão já criada não é erro)
- [ ] QR code salvo como arquivo de imagem válido, path informado no console
- [ ] Erro claro se `WHATSAPP_WAHA_URL`/`WHATSAPP_WAHA_API_KEY`/`WHATSAPP_WAHA_SESSION` não estiverem configurados

**Verification:**
- [ ] Tests pass: `npx vitest run tests/scripts/parearWhatsapp.test.ts` (mocka a API da WAHA — não depende de sessão real)
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: QR gerado de verdade contra a sessão WAHA de Homologação, escaneado com o número dedicado, sessão fica `WORKING`

**Dependencies:** Tarefa 122

**Files likely touched:**
- `src/scripts/parearWhatsapp.ts`
- `tests/scripts/parearWhatsapp.test.ts`

**Estimated scope:** Small

---

### Tarefa 124: `src/canais/whatsapp.ts` (cliente HTTP fino pra WAHA)

**Description:** `enviarTextoWhatsapp(config, destinatario, texto)`, `enviarImagemWhatsapp(config, destinatario, imagem: Buffer, legenda?)`, `enviarDocumentoWhatsapp(config, destinatario, documento: Buffer, nomeArquivo)` — `fetch` direto contra `POST {WAHA_URL}/api/sendText`/`/api/sendImage`/`/api/sendFile`, autenticado via header de API key, mídia em base64 (`file.data`). `config` é `{ url, apiKey, session }` (vem de `env`, mas função pura o suficiente pra testar sem carregar env de verdade). `destinatario` no formato de número que a WAHA espera (`<numero>@c.us`) — validar/normalizar formato antes de montar o payload.

**Acceptance criteria:**
- [ ] `enviarTextoWhatsapp` monta o payload certo (`session`, `chatId`, `text`) e inclui o header de API key
- [ ] `enviarImagemWhatsapp`/`enviarDocumentoWhatsapp` codificam o Buffer em base64 no campo `file.data`, com `mimetype`/`filename` corretos
- [ ] Erro de rede/resposta não-2xx da WAHA propaga como exceção clara (mensagem inclui status HTTP), não falha silenciosa
- [ ] Número de destinatário sem o sufixo `@c.us` é normalizado antes do envio

**Verification:**
- [ ] Tests pass: `npx vitest run tests/canais/whatsapp.test.ts` (mocka `fetch` global)
- [ ] Build succeeds: `npm run build`

**Dependencies:** None (não depende da Tarefa 122/123 pra existir — só pra ser testado de verdade)

**Files likely touched:**
- `src/canais/whatsapp.ts`
- `tests/canais/whatsapp.test.ts`

**Estimated scope:** Small

---

### Tarefa 125: `src/canais/notificar.ts` (fan-out Telegram + WhatsApp)

**Description:** `notificarTexto(env, bot, chatIds, texto)`, `notificarImagem(env, bot, chatIds, imagem, legenda?)`, `notificarDocumento(env, bot, chatIds, documento, nomeArquivo)` — manda pro Telegram como cada script já faz hoje (`bot.api.sendMessage`/`sendPhoto`/`sendDocument` por `chatId`), e adicionalmente, se `env.whatsappWahaUrl` (e demais variáveis) estiverem presentes, manda a mesma mensagem por WhatsApp via `src/canais/whatsapp.ts` pra cada número de `env.whatsappDestinatarios`. Falha de envio num canal não impede o outro nem lança exceção pro chamador (mesmo princípio já usado em `tratarErroCriticoJob` — loga e segue).

**Acceptance criteria:**
- [ ] Com WhatsApp configurado: mensagem sai pros dois canais
- [ ] Sem WhatsApp configurado: mensagem sai só por Telegram, sem erro nem log de "tentou e falhou"
- [ ] Falha no envio WhatsApp (ex: sessão desconectada) não impede o envio Telegram, e vice-versa
- [ ] Falha em qualquer canal é logada, não lançada como exceção (chamador não precisa de try/catch pra isso)

**Verification:**
- [ ] Tests pass: `npx vitest run tests/canais/notificar.test.ts`
- [ ] Build succeeds: `npm run build`

**Dependencies:** Tarefa 124

**Files likely touched:**
- `src/canais/notificar.ts`
- `tests/canais/notificar.test.ts`

**Estimated scope:** Medium

---

## Checkpoint: Infraestrutura e envio funcionais (sem wiring nos jobs ainda)
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual: sessão WAHA pareada em Homologação, `notificarTexto`/`notificarImagem`/`notificarDocumento` testados contra a sessão real — mensagem chega no WhatsApp
- [ ] Revisão com o usuário antes de prosseguir pro wiring nos jobs

---

### Tarefa 126: wiring — relatórios e erro crítico

**Description:** `relatorioSemanal.ts` (`notificarImagem` em vez de `bot.api.sendPhoto`), `relatorioMensal.ts` (`notificarDocumento` em vez de `bot.api.sendDocument`), `tratarErroCriticoJob.ts` (`notificarTexto` em vez de `bot.api.sendMessage`) — comportamento de negócio idêntico, só troca o mecanismo de envio final. Assinatura de `tratarErroCriticoJob` ganha `env` no lugar de (ou junto de) `botToken`/`chatIds` crus, pra ter acesso às variáveis do WhatsApp.

**Acceptance criteria:**
- [ ] Os 3 scripts continuam funcionando exatamente igual quando WhatsApp não está configurado (regressão zero)
- [ ] Com WhatsApp configurado, os 3 passam a mandar a mesma mídia/texto pros dois canais

**Verification:**
- [ ] Tests pass: `npx vitest run tests/scripts/relatorioSemanal.test.ts tests/scripts/relatorioMensal.test.ts tests/scripts/tratarErroCriticoJob.test.ts`
- [ ] Build succeeds: `npm run build`

**Dependencies:** Tarefa 125

**Files likely touched:**
- `src/scripts/relatorioSemanal.ts`
- `src/scripts/relatorioMensal.ts`
- `src/scripts/tratarErroCriticoJob.ts`
- Testes correspondentes

**Estimated scope:** Medium

---

### Tarefa 127: wiring — alertas operacionais

**Description:** `monitorarPrecos.ts`, `verificarDespesasFixas.ts`, `lerEmailFaturas.ts`, `sincronizarOpenFinance.ts` — mesma troca de `bot.api.sendX` por `notificar*` da Tarefa 126, aplicada aos 4 scripts restantes que mandam mensagem proativa.

**Acceptance criteria:**
- [ ] Os 4 scripts continuam funcionando exatamente igual quando WhatsApp não está configurado (regressão zero)
- [ ] Com WhatsApp configurado, os 4 passam a mandar a mesma mensagem pros dois canais

**Verification:**
- [ ] Tests pass: `npx vitest run tests/scripts/monitorarPrecos.test.ts tests/scripts/verificarDespesasFixas.test.ts tests/scripts/lerEmailFaturas.test.ts tests/scripts/sincronizarOpenFinance.test.ts`
- [ ] Build succeeds: `npm run build`

**Dependencies:** Tarefa 125

**Files likely touched:**
- `src/scripts/monitorarPrecos.ts`
- `src/scripts/verificarDespesasFixas.ts`
- `src/scripts/lerEmailFaturas.ts`
- `src/scripts/sincronizarOpenFinance.ts`
- Testes correspondentes

**Estimated scope:** Medium

---

## Checkpoint: Rodada 1 fechada (mensagens proativas no WhatsApp)
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: `relatorioSemanal.js --agora`/`relatorioMensal.js --agora` de verdade — mensagem chega nos dois canais
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de considerar a Rodada 2 (chat bidirecional)
