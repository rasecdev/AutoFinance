# Todo: Multi-canal — WhatsApp via WAHA (Rodada 1: mensagens proativas)

Ver `tasks/plan.md` pro racional completo das decisões de arquitetura. Rodada 1 cobre só envio proativo (relatório semanal/mensal, alertas) via WhatsApp, em paralelo ao Telegram — chat bidirecional fica pra uma Rodada 2 futura.

---

### Tarefa 122: `docker-compose.yml` (serviços WAHA) + `env.ts` (novas variáveis)

**Description:** Dois novos serviços no `docker-compose.yml`, mesmo padrão de todo par existente (imagem oficial `devlikeapro/waha`, sem `build:` próprio — é imagem publicada, diferente do resto do projeto que sempre builda a própria): `whatsapp-homologacao`/`whatsapp-producao`, motor `NOWEB` via env var (`WHATSAPP_DEFAULT_ENGINE=NOWEB`), volume próprio por ambiente pra persistir a sessão (evita reescanear QR a cada restart), variável de API key própria por ambiente. `env.ts` ganha `WHATSAPP_WAHA_URL`, `WHATSAPP_WAHA_API_KEY`, `WHATSAPP_WAHA_SESSION`, `WHATSAPP_DESTINATARIOS` (lista de números, mesmo formato de `TELEGRAM_ALLOWED_CHAT_IDS`) — todas opcionais mas exigidas juntas (`superRefine`, mesma regra do par Google/Pluggy). Ausentes por completo é estado válido.

**Acceptance criteria:**
- [x] `docker compose config` valida sem erro com os dois serviços novos — confirmado no CI do PR #406 (job `docker`: `docker build .` + `docker compose config`, ambos verdes)
- [x] `env.ts`: as 4 variáveis ausentes juntas não geram erro de validação (integração desligada)
- [x] `env.ts`: só parte das 4 variáveis presentes gera erro de validação claro (mesmo padrão do par Google)
- [x] Serviço `whatsapp-homologacao` sobe localmente (`docker compose up whatsapp-homologacao`) e responde no endpoint de health/QR da WAHA — confirmado na VM: `whatsapp-homologacao`/`whatsapp-producao` `Started`, `curl http://127.0.0.1:3000/api/health` responde `401 Unauthorized` (serviço de pé, exige API key por padrão — tratado na Tarefa 123/124)

**Verification:**
- [x] Tests pass: `npx vitest run tests/config/env.test.ts`
- [x] Build succeeds: `npm run build`
- [x] Manual check: `sudo docker compose up -d` subiu os 24 serviços na VM (Homologação e Produção, inclusive os dois que o `deploy.sh` vinha deixando de fora), `curl` no endpoint de health da WAHA confirmou resposta

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
- [x] Cria a sessão se ainda não existir (idempotente — sessão já criada não é erro)
- [x] QR code salvo como arquivo de imagem válido, path informado no console
- [x] Erro claro se `WHATSAPP_WAHA_URL`/`WHATSAPP_WAHA_API_KEY`/`WHATSAPP_WAHA_SESSION` não estiverem configurados

**Verification:**
- [x] Tests pass: `npx vitest run tests/scripts/parearWhatsapp.test.ts` (mocka a API da WAHA — não depende de sessão real)
- [x] Build succeeds: `npm run build`
- [x] Manual check: QR gerado de verdade contra a sessão WAHA de Homologação, escaneado com o número dedicado, sessão fica `WORKING` — confirmado (2026-10-09), `GET /api/sessions/default` retornou `"status":"WORKING"`

**Dependencies:** Tarefa 122

**Files likely touched:**
- `src/scripts/parearWhatsapp.ts`
- `tests/scripts/parearWhatsapp.test.ts`

**Estimated scope:** Small

---

### Tarefa 124: `src/canais/whatsapp.ts` (cliente HTTP fino pra WAHA)

**Description:** `enviarTextoWhatsapp(config, destinatario, texto)`, `enviarImagemWhatsapp(config, destinatario, imagem: Buffer, legenda?)`, `enviarDocumentoWhatsapp(config, destinatario, documento: Buffer, nomeArquivo)` — `fetch` direto contra `POST {WAHA_URL}/api/sendText`/`/api/sendImage`/`/api/sendFile`, autenticado via header de API key, mídia em base64 (`file.data`). `config` é `{ url, apiKey, session }` (vem de `env`, mas função pura o suficiente pra testar sem carregar env de verdade). `destinatario` no formato de número que a WAHA espera (`<numero>@c.us`) — validar/normalizar formato antes de montar o payload.

**Acceptance criteria:**
- [x] `enviarTextoWhatsapp` monta o payload certo (`session`, `chatId`, `text`) e inclui o header de API key
- [x] `enviarImagemWhatsapp`/`enviarDocumentoWhatsapp` codificam o Buffer em base64 no campo `file.data`, com `mimetype`/`filename` corretos
- [x] Erro de rede/resposta não-2xx da WAHA propaga como exceção clara (mensagem inclui status HTTP), não falha silenciosa
- [x] Número de destinatário sem o sufixo `@c.us` é normalizado antes do envio

**Verification:**
- [x] Tests pass: `npx vitest run tests/canais/whatsapp.test.ts` (mocka `fetch` global)
- [x] Build succeeds: `npm run build`

**Dependencies:** None (não depende da Tarefa 122/123 pra existir — só pra ser testado de verdade)

**Files likely touched:**
- `src/canais/whatsapp.ts`
- `tests/canais/whatsapp.test.ts`

**Estimated scope:** Small

---

### Tarefa 125: `src/canais/notificar.ts` (fan-out Telegram + WhatsApp)

**Description:** `notificarTexto(env, bot, chatIds, texto)`, `notificarImagem(env, bot, chatIds, imagem, legenda?)`, `notificarDocumento(env, bot, chatIds, documento, nomeArquivo)` — manda pro Telegram como cada script já faz hoje (`bot.api.sendMessage`/`sendPhoto`/`sendDocument` por `chatId`), e adicionalmente, se `env.whatsappWahaUrl` (e demais variáveis) estiverem presentes, manda a mesma mensagem por WhatsApp via `src/canais/whatsapp.ts` pra cada número de `env.whatsappDestinatarios`. Falha de envio num canal não impede o outro nem lança exceção pro chamador (mesmo princípio já usado em `tratarErroCriticoJob` — loga e segue).

**Acceptance criteria:**
- [x] Com WhatsApp configurado: mensagem sai pros dois canais
- [x] Sem WhatsApp configurado: mensagem sai só por Telegram, sem erro nem log de "tentou e falhou"
- [x] Falha no envio WhatsApp (ex: sessão desconectada) não impede o envio Telegram, e vice-versa
- [x] Falha em qualquer canal é logada, não lançada como exceção (chamador não precisa de try/catch pra isso)

**Verification:**
- [x] Tests pass: `npx vitest run tests/canais/notificar.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Tarefa 124

**Files likely touched:**
- `src/canais/notificar.ts`
- `tests/canais/notificar.test.ts`

**Estimated scope:** Medium

---

## Checkpoint: Infraestrutura e envio funcionais (sem wiring nos jobs ainda)
- [x] `npm run build`/`lint`/`test` sem erro
- [x] Teste manual: sessão WAHA pareada em Homologação, `notificarTexto`/`notificarImagem`/`notificarDocumento` testados contra a sessão real — mensagem chega no WhatsApp (2026-10-09; achado real: `WHATSAPP_DESTINATARIOS` precisou do número sem o "9" extra — `557192839549`, não `5571992839549` — pra WhatsApp resolver o chatId certo)
- [x] Revisão com o usuário antes de prosseguir pro wiring nos jobs (2026-10-09, confirmado: mensagens de teste chegaram no destinatário)

---

### Tarefa 126: wiring — relatórios e erro crítico

**Description:** `relatorioSemanal.ts` (`notificarImagem` em vez de `bot.api.sendPhoto`), `relatorioMensal.ts` (`notificarDocumento` em vez de `bot.api.sendDocument`), `tratarErroCriticoJob.ts` (`notificarTexto` em vez de `bot.api.sendMessage`) — comportamento de negócio idêntico, só troca o mecanismo de envio final. Assinatura de `tratarErroCriticoJob` ganha `env` no lugar de (ou junto de) `botToken`/`chatIds` crus, pra ter acesso às variáveis do WhatsApp.

**Acceptance criteria:**
- [x] Os 3 scripts continuam funcionando exatamente igual quando WhatsApp não está configurado (regressão zero)
- [x] Com WhatsApp configurado, os 3 passam a mandar a mesma mídia/texto pros dois canais

**Verification:**
- [x] Tests pass: `npx vitest run tests/scripts/relatorioSemanal.test.ts tests/scripts/relatorioMensal.test.ts tests/scripts/tratarErroCriticoJob.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Tarefa 125

**Achado real:** mudar a assinatura de `tratarErroCriticoJob` pra receber `env` (em vez de `botToken`/`chatIds` crus) cascateou pra todos os 10 chamadores do projeto, não só os 3 listados abaixo — `backup.ts`, `expurgarDadosAntigos.ts`, `lerEmailFaturas.ts`, `monitorarPrecos.ts`, `renovarSandboxPluggy.ts` (2 pontos), `sincronizarCalendario.ts`, `sincronizarOpenFinance.ts`, `verificarDespesasFixas.ts` — todos só trocaram `env.telegramBotToken, env.telegramAllowedChatIds` por `env`, sem mudar a própria assinatura exportada de cada um (mínimo necessário pro build passar). Efeito colateral desejável: erro crítico de qualquer job passa a sair por WhatsApp também, quando configurado — exceto no loop por item de `renovarSandboxPluggy.ts` (sem acesso ao `Env` completo ali), que continua só por Telegram de propósito (comentário no código). `notificarTexto`/`notificarImagem`/`notificarDocumento` (`src/canais/notificar.ts`) tiveram o parâmetro `env: Env` afrouxado pra `Pick<Env, 'whatsapp'>` — só o que usam de fato, permitindo esse reaproveitamento sem precisar do tipo `Env` inteiro.

**Files likely touched:**
- `src/scripts/relatorioSemanal.ts`
- `src/scripts/relatorioMensal.ts`
- `src/scripts/tratarErroCriticoJob.ts`
- `src/canais/notificar.ts` (tipo do parâmetro `env`, sem mudança de comportamento)
- `src/scripts/backup.ts`, `expurgarDadosAntigos.ts`, `lerEmailFaturas.ts`, `monitorarPrecos.ts`, `renovarSandboxPluggy.ts`, `sincronizarCalendario.ts`, `sincronizarOpenFinance.ts`, `verificarDespesasFixas.ts` (só a chamada de `tratarErroCriticoJob`, por causa da assinatura nova)
- Testes correspondentes

**Estimated scope:** Medium

---

### Tarefa 127: wiring — alertas operacionais

**Description:** `monitorarPrecos.ts`, `verificarDespesasFixas.ts`, `lerEmailFaturas.ts`, `sincronizarOpenFinance.ts` — mesma troca de `bot.api.sendX` por `notificar*` da Tarefa 126, aplicada aos 4 scripts restantes que mandam mensagem proativa.

**Acceptance criteria:**
- [x] Os 3 scripts com mensagem proativa simples continuam funcionando exatamente igual quando WhatsApp não está configurado (regressão zero)
- [x] Com WhatsApp configurado, esses 3 passam a mandar a mesma mensagem pros dois canais

**Verification:**
- [x] Tests pass: `npx vitest run tests/scripts/monitorarPrecos.test.ts tests/scripts/verificarDespesasFixas.test.ts tests/scripts/lerEmailFaturas.test.ts tests/scripts/sincronizarOpenFinance.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Tarefa 125

**Achado real, decisão revisada com o usuário (2026-10-09):** `lerEmailFaturas.ts` **não foi tocado** — as duas únicas mensagens que ele manda são pedidos de confirmação com teclado inline (`reply_markup`, aprovar/rejeitar fatura extraída por e-mail), não notificação simples. Rotear isso por `notificarTexto` perderia os botões — WhatsApp não tem equivalente nesta Rodada 1 (chat bidirecional é Rodada 2, corte já registrado no PLANO.md). Decisão confirmada com o usuário: continua só por Telegram por enquanto; registrado em PLANO.md (Fase 9) como motivação explícita pra Rodada 2 levar o WhatsApp à paridade com o Telegram nesse tipo de interação. `monitorarPrecos.ts` (`enviarAlertas` ganhou `env`/`logger` no lugar de `botToken` cru), `verificarDespesasFixas.ts` e `sincronizarOpenFinance.ts` (`processarTransacao`/`sincronizarOpenFinance` exportadas trocaram `chatIds: string[]` por `env`) wired normalmente.

**Files likely touched:**
- `src/scripts/monitorarPrecos.ts`
- `src/scripts/verificarDespesasFixas.ts`
- `src/scripts/sincronizarOpenFinance.ts`
- ~~`src/scripts/lerEmailFaturas.ts`~~ (não tocado — ver achado real acima)
- Testes correspondentes

**Estimated scope:** Medium

---

### Tarefa 128: `deploy.sh` (VM) — ler a lista de serviços do `docker-compose.yml` em vez de lista fixa

**Description:** Lacuna encontrada na Tarefa 122 (PROGRESSO.md, 2026-10-06): `/opt/autofinance-deploy/deploy.sh` na VM (dono `root`, fora deste repositório, não editável pela automação de deploy) usa uma lista fixa/parcial de nomes de serviço pra decidir o que recriar — serviços novos adicionados ao `docker-compose.yml` (ex: `whatsapp-homologacao`/`whatsapp-producao`) nunca sobem no primeiro deploy automático, exigindo `docker compose up -d` manual na VM pra "ativar" cada serviço novo uma vez. Esta tarefa versiona o script no repositório como fonte de verdade (`infra/deploy.sh`), corrigido pra descobrir os serviços do ambiente dinamicamente (`docker compose config --services`, filtrando por sufixo `-homologacao`/`-producao`) em vez de listar nomes à mão, e documenta o passo manual (fora do alcance da automação, por desenho de segurança do usuário dedicado sem sudo) de substituir o arquivo na VM por este.

**Acceptance criteria:**
- [ ] `infra/deploy.sh` no repositório é a fonte de verdade — recebe o nome do ambiente (`homologacao`/`producao`) como argumento, igual ao script atual da VM
- [ ] Lista de serviços derivada de `docker compose config --services`, filtrada pelo sufixo do ambiente — nenhum nome de serviço hardcoded
- [ ] `docker compose up -d --build` usa essa lista — serviço novo no `docker-compose.yml` passa a subir no deploy automático seguinte, sem intervenção manual
- [ ] Documentado em comentário no próprio arquivo que a aplicação na VM é manual (substituir `/opt/autofinance-deploy/deploy.sh`, dono `root`) — a automação de CI/deploy não tem permissão de alterar esse arquivo

**Verification:**
- [ ] Revisão do script (shellcheck, se configurado no projeto; senão leitura manual) — sem teste automatizado possível (script roda fora do runtime Node do projeto)
- [ ] Manual check: usuário substitui o arquivo na VM e confirma, no próximo push em `development`, que um serviço fictício/novo sobe sem `docker compose up -d` manual

**Dependencies:** None

**Files likely touched:**
- `infra/deploy.sh` (novo)

**Estimated scope:** Small

---

## Checkpoint: Rodada 1 fechada (mensagens proativas no WhatsApp)
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: `relatorioSemanal.js --agora`/`relatorioMensal.js --agora` de verdade — mensagem chega nos dois canais
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de considerar a Rodada 2 (chat bidirecional)
