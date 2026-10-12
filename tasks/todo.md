# Todo: Multi-canal — WhatsApp via WAHA (Rodada 2: chat bidirecional)

Ver `tasks/plan.md` pro racional completo das decisões de arquitetura. Rodada 2 dá ao WhatsApp paridade com o Telegram em chat livre, confirmação de ação, confirmação de fatura por e-mail e dois comandos (`/registrar_open_finance`/`/registrar_email`). Mídia de verdade e demais comandos ficam pra depois.

---

### Tarefa 129: Generalizar `chatId` pra `number | string`

**Description:** Todo `Map`/parâmetro que hoje assume `chatId: number` (Telegram) passa a aceitar também o formato string do WhatsApp (`"<numero>@c.us"`), sem mudar nenhum comportamento do Telegram. Alcança: `confirmacao.ts` (`pendencias`), `googleOAuthPendencia.ts`, `openFinancePendencia.ts`, `modeloAtivo.ts`, `confirmacoesPendentes.ts`/`botPausado.ts` (repositórios — a coluna SQL não precisa de migration, nenhuma tabela do projeto é `STRICT`), e a cadeia de parâmetros que propaga `chatId` até `processarMensagemTexto`/`createHandlerCallbackConfirmacao`.

**Acceptance criteria:**
- [x] Nenhum desses módulos mais declara `Map<number, ...>`/parâmetro `chatId: number` — todos aceitam `number | string` (alcançou também `contextoRecente.ts`, `resumosConversa.ts`, `interacoesIa.ts`, `ai/contexto.ts`, `ai/resumirContexto.ts`, `ai/tools/transacoes.ts` e `ai/tools/types.ts` — não previstos na lista original de "Files likely touched", mas fazem parte da mesma cadeia que `processarMensagemTexto` propaga)
- [x] `chatId` é tratado como valor opaco em todo esse caminho (nunca convertido pra número, nunca usado em conta aritmética)
- [x] Comportamento do Telegram inalterado (regressão zero) — `callbackConfirmacao.ts` não precisou de mudança nenhuma (infere o tipo de `ctx.chat?.id`, sem anotação própria); `midia.ts`/`registrarEmail.ts` deixados como `number` de propósito, por serem handlers 100% Telegram até a Tarefa 136 (WhatsApp não chama essas funções ainda — `number` continua válido como argumento de tudo que já aceita `number | string`)

**Verification:**
- [x] Tests pass: `npx vitest run` (suíte completa)
- [x] Build succeeds: `npm run build`
- [x] Manual check: nenhum — mudança de tipo, sem efeito observável ainda nesta tarefa

**Dependencies:** None

**Files likely touched:**
- `src/bot/confirmacao.ts`, `src/bot/googleOAuthPendencia.ts`, `src/bot/openFinancePendencia.ts`, `src/bot/modeloAtivo.ts`
- `src/db/repositories/confirmacoesPendentes.ts`, `src/db/repositories/botPausado.ts`
- `src/bot/handlers/texto.ts`, `src/bot/handlers/callbackConfirmacao.ts`

**Estimated scope:** Medium

---

### Tarefa 130: Interface mínima de saída (`CanalContext`) no núcleo de conversa

**Description:** Define uma interface estrutural mínima (`reply`/`replyWithPhoto`/`replyWithDocument`/`replyWithChatAction`) e troca o tipo do parâmetro `ctx` nos pontos do núcleo de conversa que hoje recebem `ctx: Context` do grammy largo (`processarMensagemTexto` e o que ele chama) pra essa interface. O `Context` real do grammy já satisfaz a forma de graça (duck typing do TypeScript) — **nenhum handler de `src/bot/handlers/*` muda de comportamento**, só o tipo do parâmetro em alguns pontos.

**Acceptance criteria:**
- [x] Interface nova definida (`CanalContext`, `src/canais/contextoCanal.ts`) com só os 4 métodos realmente usados (`reply`/`replyWithPhoto`/`replyWithDocument`/`replyWithChatAction`)
- [x] `processarMensagemTexto` (e `comIndicadorDigitando`, que ele chama) aceita essa interface em vez de `Context` do grammy
- [x] Telegram continua funcionando sem nenhuma mudança de comportamento observável — **achado real, corrige a premissa original:** o `Context` do grammy NÃO satisfaz a interface de graça pros 4 métodos — `replyWithPhoto`/`replyWithDocument` exigem `InputFile` (não `Buffer` crú) e `InputFile` não expõe o `Buffer` de volta (campo interno privado), então um adapter (`criarContextoTelegram`) precisou ser escrito pro lado Telegram também, não só pro WhatsApp (Tarefa 133). `reply`/`replyWithChatAction` por si só seriam estruturalmente compatíveis, mas o adapter cobre os 4 juntos por simplicidade/consistência. Teclado de confirmação (`montarTecladoConfirmacao`) migrou de `texto.ts` pra dentro do adapter, acionado por um novo parâmetro `pedirConfirmacao` (o núcleo só sinaliza a intenção, nunca a mecânica — mantém a decisão de arquitetura "confirmação por canal")

**Verification:**
- [x] Tests pass: `npx vitest run` (suíte completa, 134/134 arquivos, 1049/1049 testes) + teste novo (`tests/canais/contextoCanal.test.ts`) passando objeto fake que implementa só a interface mínima, cobrindo também o adapter Telegram isoladamente
- [x] Build succeeds: `npm run build`
- [x] Manual check: nenhum — ainda não há segundo canal consumindo isso

**Dependencies:** Tarefa 129

**Files likely touched:**
- `src/canais/contextoCanal.ts` (novo)
- `src/bot/handlers/texto.ts`, `src/bot/handlers/voz.ts`, `src/bot/handlers/midia.ts` (não previsto originalmente — também chama `processarMensagemTexto`)
- `tests/bot/handlers/texto.test.ts`, `tests/bot/handlers/voz.test.ts` (asserções sobre a forma da chamada a `ctx.reply`/`processarMensagemTexto` ajustadas)
- `tests/canais/contextoCanal.test.ts` (novo)

**Estimated scope:** Small

---

### Tarefa 131: Idempotência de evento WAHA

**Description:** Tabela nova (migration) + repositório pra marcar "evento/mensagem da WAHA já processado", mesmo padrão de `emailsProcessados.ts`/`transacoesOpenFinanceProcessadas.ts`. Usada pelo webhook (Tarefa 132) antes de executar qualquer tool, pra nunca duplicar uma ação financeira por reentrega.

**Acceptance criteria:**
- [x] Migration nova (`0022_eventos_whatsapp_processados.sql`) cria a tabela (`evento_id TEXT NOT NULL UNIQUE`)
- [x] Repositório (`eventosWhatsappProcessados.ts`) expõe `eventoJaProcessado`/`marcarEventoProcessado`, mesmo formato de `emailsProcessados.ts`
- [x] Chamar `marcarEventoProcessado` duas vezes pro mesmo id não lança erro (`INSERT OR IGNORE`, idempotente de verdade)

**Verification:**
- [x] Tests pass: `npx vitest run` (suíte completa, 135/135 arquivos, 1053/1053 testes) + `tests/db/eventosWhatsappProcessados.test.ts` (novo)
- [x] Build succeeds: `npm run build`
- [x] Manual check: nenhum — infraestrutura, sem consumidor ainda

**Dependencies:** None

**Files likely touched:**
- `src/db/migrations/0022_eventos_whatsapp_processados.sql` (novo)
- `src/db/repositories/eventosWhatsappProcessados.ts` (novo)
- `tests/db/eventosWhatsappProcessados.test.ts` (novo, não listado originalmente)

**Estimated scope:** Small

---

### Tarefa 132: Endpoint HTTP interno + validação HMAC

**Description:** Novo listener HTTP no mesmo processo do bot (ao lado do `bot.start()` do grammy em `index.ts`), só acessível na rede interna do `docker-compose`. Recebe o POST da WAHA, valida a assinatura (`X-Webhook-Hmac`, chave `WHATSAPP_WEBHOOK_HMAC_KEY`) antes de qualquer parsing — requisição sem assinatura válida é rejeitada (4xx) sem processar. Aplica a checagem de idempotência (Tarefa 131) antes de despachar pro handler de evento.

**Acceptance criteria:**
- [ ] Servidor HTTP novo sobe junto do bot, porta fixa configurável
- [ ] Requisição sem HMAC válido (ou com `env.whatsapp` ausente) é rejeitada sem processar o corpo
- [ ] Evento já marcado como processado (Tarefa 131) é ignorado sem executar nada de novo
- [ ] Evento desconhecido (tipo não mapeado) é ignorado sem lançar erro

**Verification:**
- [ ] Tests pass: `npx vitest run` + testes novos chamando o handler direto com payload já deserializado (sem subir servidor de verdade): HMAC válido/inválido, idempotência, evento desconhecido
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: nenhum ainda — sem rota real da WAHA configurada (Tarefa 138)

**Dependencies:** Tarefa 131

**Files likely touched:**
- `src/canais/webhookWhatsapp.ts` (novo)
- `src/index.ts`
- `src/config/env.ts` (`WHATSAPP_WEBHOOK_HMAC_KEY`)

**Estimated scope:** Medium

---

### Tarefa 133: `WhatsAppContext` (implementação da interface mínima)

**Description:** Implementa a interface da Tarefa 130 por cima dos clientes WAHA já existentes da Rodada 1 (`enviarTextoWhatsapp`/`enviarImagemWhatsapp`/`enviarDocumentoWhatsapp`) — `replyWithChatAction` pode ser um no-op (WAHA não tem indicador de "digitando" equivalente confirmado; se existir, usar, senão não bloquear a tarefa por isso).

**Acceptance criteria:**
- [ ] Classe/factory nova implementa `reply`/`replyWithPhoto`/`replyWithDocument`/`replyWithChatAction` chamando os clientes WAHA certos
- [ ] Erro de envio num desses métodos é logado (mesmo padrão de `notificar.ts`), nunca lança pro chamador

**Verification:**
- [ ] Tests pass: `npx vitest run` + teste novo mockando o cliente WAHA (`vi.mock('../../src/canais/whatsapp.js', ...)`, mesmo padrão da Rodada 1)
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: nenhum ainda

**Dependencies:** Tarefa 130

**Files likely touched:**
- `src/canais/contextoWhatsapp.ts` (novo)

**Estimated scope:** Small

---

### Tarefa 134: Roteamento de mensagem de texto entrante

**Description:** O webhook (Tarefa 132), ao receber um evento de mensagem de texto, verifica a allowlist (`WHATSAPP_DESTINATARIOS` — mesmo princípio do `createAllowlistMiddleware` do Telegram: fora da lista, ignora e loga, sem responder) e, se permitido, chama `processarMensagemTexto` (núcleo já generalizado nas Tarefas 129/130) passando o `WhatsAppContext` (Tarefa 133).

**Acceptance criteria:**
- [ ] Mensagem de número fora de `WHATSAPP_DESTINATARIOS` é ignorada (log, sem resposta)
- [ ] Mensagem de número permitido chega em `processarMensagemTexto` e a resposta da IA sai pelo `WhatsAppContext`
- [ ] Contexto/histórico de conversa (`interacoes_ia`, resumo) funciona pro `chatId` do WhatsApp igual já funciona pro Telegram

**Verification:**
- [ ] Tests pass: `npx vitest run` (suíte completa, + testes novos do roteamento)
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: nenhum ainda — checkpoint de Fase B cobre isso depois da Tarefa 138 (wiring)

**Dependencies:** Tarefas 132, 133

**Files likely touched:**
- `src/canais/webhookWhatsapp.ts`

**Estimated scope:** Small

---

### Tarefa 135: Confirmação de ação via Poll

**Description:** Função nova no cliente WAHA pra enviar Poll (2 opções, "Confirmar"/"Cancelar"). No caminho de confirmação (`processarMensagemTexto`, e o ponto equivalente usado por `lerEmailFaturas.ts` pra fatura por e-mail), quando o canal é WhatsApp, envia a Poll em vez de montar o teclado do Telegram. O webhook (Tarefa 132) ganha um handler pro evento `poll.vote`, correlaciona com a pendência (mesma pendência generalizada na Tarefa 129) e confirma/cancela a ação.

**Acceptance criteria:**
- [ ] Ação de alto impacto no WhatsApp dispara uma Poll, não texto puro nem tentativa de botão
- [ ] Votar "Confirmar" executa a tool pendente e responde o resultado; votar "Cancelar" cancela sem executar
- [ ] Fatura/boleto extraída por e-mail, com destinatário WhatsApp configurado, também usa esse mesmo caminho de confirmação

**Verification:**
- [ ] Tests pass: `npx vitest run` + testes novos mockando o envio de Poll e simulando o payload de `poll.vote`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: votar numa Poll de teste em Homologação, confirmar que a ação executa/cancela certo

**Dependencies:** Tarefas 131, 133, 134

**Files likely touched:**
- `src/canais/whatsapp.ts` (nova função de envio de Poll)
- `src/canais/webhookWhatsapp.ts`
- `src/bot/handlers/texto.ts`, `src/scripts/lerEmailFaturas.ts`

**Estimated scope:** Medium

---

### Tarefa 136: Comandos `/registrar_open_finance` e `/registrar_email` via WhatsApp

**Description:** O webhook (Tarefa 134), antes de cair no roteamento de conversa livre, reconhece esses dois comandos (mesma regex de `comandos.ts`) e chama os handlers já existentes (`createHandlerRegistrarOpenFinance`/`createHandlerRegistrarEmail`), adaptados pra funcionar com o `WhatsAppContext` quando precisarem só dos métodos da interface mínima — qualquer necessidade adicional de `ctx` fica registrada como achado, não resolvida silenciosamente.

**Acceptance criteria:**
- [ ] `/registrar_open_finance <item_id>` via WhatsApp lista as contas e aceita o mapeamento "número = nome", mesmo fluxo do Telegram
- [ ] `/registrar_email` via WhatsApp gera o link de consentimento e aceita o código colado de volta

**Verification:**
- [ ] Tests pass: `npx vitest run` (suíte completa, + testes novos desses dois comandos via WhatsApp)
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: rodar os dois comandos de verdade em Homologação

**Dependencies:** Tarefa 134

**Files likely touched:**
- `src/canais/webhookWhatsapp.ts`
- `src/bot/handlers/registrarOpenFinance.ts`, `src/bot/handlers/registrarEmail.ts`

**Estimated scope:** Medium

---

### Tarefa 137: Resposta de "mídia não suportada"

**Description:** Evento de mídia (foto/documento/áudio) recebido pelo webhook responde com uma mensagem clara avisando que esse tipo de conteúdo ainda não é suportado pelo WhatsApp (equivalente ao `handlerNaoSuportado` do Telegram), em vez de ser ignorado em silêncio.

**Acceptance criteria:**
- [ ] Mensagem de mídia via WhatsApp recebe resposta de "não suportado ainda", nunca trava o fluxo de texto nem é ignorada sem resposta

**Verification:**
- [ ] Tests pass: `npx vitest run` + teste novo desse caminho
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: mandar uma foto de teste pro número da WAHA em Homologação

**Dependencies:** Tarefa 132

**Files likely touched:**
- `src/canais/webhookWhatsapp.ts`

**Estimated scope:** Small

---

### Tarefa 138: `docker-compose.yml`/`env.ts` — wiring do webhook na sessão WAHA

**Description:** `env.ts` ganha `WHATSAPP_WEBHOOK_HMAC_KEY` (exigida junto do grupo `whatsapp` já existente). A sessão WAHA (`whatsapp-homologacao`/`whatsapp-producao`) é configurada (via `config.webhooks[]` na criação da sessão, ou variável de ambiente `WHATSAPP_HOOK_URL`/`WHATSAPP_HOOK_EVENTS`/`WHATSAPP_HOOK_HMAC_KEY` do próprio container WAHA) pra chamar o endpoint novo (Tarefa 132) no serviço do bot, pelo nome do serviço no `docker-compose` (DNS interno).

**Acceptance criteria:**
- [ ] `WHATSAPP_WEBHOOK_HMAC_KEY` ausente quando `env.whatsapp` está configurado é erro de validação claro (mesmo padrão do grupo `whatsapp`)
- [ ] Sessão WAHA (Homologação) configurada de verdade pra chamar o endpoint novo, confirmado mandando mensagem real e vendo o webhook disparar (log do bot)

**Verification:**
- [ ] Tests pass: `npx vitest run tests/config/env.test.ts`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: `docker compose config` valida sem erro; webhook disparando de verdade na VM

**Dependencies:** Tarefa 132

**Files likely touched:**
- `docker-compose.yml`, `src/config/env.ts`, `tests/config/env.test.ts`

**Estimated scope:** Small

---

## Checkpoint: Fundação (depois das Tarefas 129-131)
- [x] `npm run build`/`lint`/`test` sem erro
- [x] Nenhuma regressão no Telegram (suíte completa passa igual antes) — 135/135 arquivos, 1053/1053 testes

## Checkpoint: Fluxo básico de texto funcional (depois das Tarefas 132-134)
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: mandar mensagem de texto pro número da WAHA, receber resposta da IA

## Checkpoint: Rodada 2 fechada (depois das Tarefas 135-138)
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: conversa livre, confirmação de ação de alto impacto (Poll), `/registrar_open_finance`, `/registrar_email`, mensagem de mídia recebendo aviso de "não suportado"
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de considerar a Rodada 3 (mídia + demais comandos)
